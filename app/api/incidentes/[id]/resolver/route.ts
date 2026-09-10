import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { cerrarMitigacionAlCerrarIncidente } from '@/lib/cierre-mitigacion'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const resueltoPor        = body.resueltoPor        ?? null
  const atribucionFinal    = body.atribucionFinal    ?? null
  const wantsNoEvaluable   = body.evaluableProveedor === false
  const userRol            = (session.user as any)?.rol ?? ''
  const isSupervisor       = ['SUPERVISOR', 'DEMO'].includes(userRol)
  const forceNoEvaluable   = resueltoPor === 'ENERGIA_ELECTRICA'
  const evaluableProveedor = forceNoEvaluable ? false : (wantsNoEvaluable ? (isSupervisor ? false : true) : true)

  const [inc] = await db.select({
    horaRegistro:          incidentes.horaRegistro,
    tiendaId:              incidentes.tiendaId,
    tipo:                  incidentes.tipo,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    contEsExterno:         incidentes.contEsExterno,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
    routerExternoId:       incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const mttrDesdeUltimaApertura = Math.round((horaFin.getTime() - new Date(inc.horaRegistro).getTime()) / 60000)
  const mttrMinutos = mttrDesdeUltimaApertura + (inc.tiempoAcumuladoMin ?? 0)

  // Corte final: ya no se sella cont/mov_hora_desactivacion. Nadie los lee para
  // un incidente con tramos, y los históricos sin tramos no se rompen — sus
  // lectores de fallback clipean la mitigación a hora_fin cuando no encuentran
  // hora de desactivación, que es exactamente lo que ese sellado escribía.
  const resueltoPorUsuarioId = (session.user as any)?.id ?? null

  // Todos los writes relacionados van en una transacción: si algo falla, no queda
  // el incidente RESUELTO con la contingencia de tienda o el router en estado inconsistente.
  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(incidentes)
      .set({ estado: 'RESUELTO', horaFin, mttrMinutos, tiempoAcumuladoMin: null, actualizadoEn: new Date(), resueltoPor, atribucionFinal, evaluableProveedor, resueltoPorUsuarioId })
      .where(eq(incidentes.id, id))
      .returning()

    // Detener el cronómetro de los escalamientos que se enviaron pero nunca
    // recibieron respuesta: se marcan como "sin respuesta" (igual que la acción
    // manual). No se inventa hora_respuesta, así el SLA refleja correctamente
    // que el proveedor no respondió, en vez de quedar el reloj corriendo.
    await tx.execute(sql`
      UPDATE escalamientos
      SET no_hubo_respuesta = true,
          estado_cronometro = 'VENCIDO'
      WHERE incidente_id = ${id}
        AND hora_envio_correo IS NOT NULL
        AND hora_respuesta IS NULL
        AND no_hubo_respuesta IS NOT TRUE
    `)

    // Sella el tramo abierto, limpia tiendas.contingencia_activa y baja el
    // router. La decisión sale de los tramos; los incidentes sin ninguno caen
    // al gate viejo cont_activado_por. Compartido con cancelar/ — ver
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
