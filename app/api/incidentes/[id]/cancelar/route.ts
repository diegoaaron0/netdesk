import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { cerrarMitigacionAlCerrarIncidente } from '@/lib/cierre-mitigacion'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.cancelar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [inc] = await db.select({
    tiendaId:              incidentes.tiendaId,
    tipo:                  incidentes.tipo,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    routerExternoId:       incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const canceladoPorId = (session.user as any)?.id ?? null

  // Corte final: ya no se sella cont/mov_hora_desactivacion. Nadie los lee para
  // un incidente con tramos, y los históricos sin tramos no se rompen — sus
  // lectores de fallback clipean la mitigación a hora_fin cuando no encuentran
  // hora de desactivación, que es exactamente lo que ese sellado escribía.

  // Writes relacionados en una transacción: evita dejar el incidente CANCELADO con la
  // contingencia de tienda o el router en estado inconsistente si algún paso falla.
  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(incidentes)
      .set({ estado: 'CANCELADO', horaFin, actualizadoEn: horaFin, canceladoPorId })
      .where(eq(incidentes.id, id))
      .returning()

    // Sella el tramo abierto, limpia tiendas.contingencia_activa y baja el
    // router. La decisión sale de los tramos; los incidentes sin ninguno caen
    // al gate viejo cont_activado_por. Compartido con resolver/ — ver
    // lib/cierre-mitigacion.ts.
    await cerrarMitigacionAlCerrarIncidente(tx, {
      incidenteId:     id,
      tiendaId:        inc.tiendaId,
      tipoIncidente:   inc.tipo,
      contActivadoPor: inc.contActivadoPor,
      routerExternoId: inc.routerExternoId,
      horaFin,
    })

    return upd
  })

  return NextResponse.json(updated)
}
