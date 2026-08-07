import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, tiendasHistorial, incidentes, routersExternos } from '@/drizzle/schema'
import { eq, and, count, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// POST /api/tiendas/[id]/baja — da de baja la tienda como entidad (archivado,
// nunca delete). Bloquea si: tiene ficha activa (el contrato se da de baja
// primero por Gestión de Cambios), tiene un router externo asignado (debe
// devolverse al almacén primero), o tiene incidentes abiertos.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.eliminar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const motivo: string = body.motivo?.trim() ?? ''
  if (!motivo) return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 })

  const [tienda] = await db.select({
    id: tiendas.id, codigo: tiendas.codigo, estado: tiendas.estado,
    fichaActivaId: tiendas.fichaActivaId, proveedorId: tiendas.proveedorId,
  }).from(tiendas).where(eq(tiendas.id, id))
  if (!tienda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (tienda.estado === 'ARCHIVADA')
    return NextResponse.json({ error: 'La tienda ya está archivada' }, { status: 400 })

  if (tienda.fichaActivaId)
    return NextResponse.json(
      { error: 'La tienda tiene una ficha activa. Da de baja el contrato primero desde Gestión de Cambios.' },
      { status: 409 },
    )

  const [{ totalRouters }] = await db.select({ totalRouters: count() })
    .from(routersExternos)
    .where(eq(routersExternos.tiendaActualId, id))
  if (totalRouters > 0)
    return NextResponse.json(
      { error: `La tienda tiene ${totalRouters} router${totalRouters > 1 ? 'es' : ''} externo${totalRouters > 1 ? 's' : ''} asignado${totalRouters > 1 ? 's' : ''}. Devuélvelo${totalRouters > 1 ? 's' : ''} al almacén primero.` },
      { status: 409 },
    )

  const [{ cnt: incidentesAbiertos }] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int AS cnt FROM incidentes
    WHERE tienda_id = ${id}
      AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
  `)
  if (Number(incidentesAbiertos) > 0)
    return NextResponse.json(
      { error: `La tienda tiene ${incidentesAbiertos} incidente${Number(incidentesAbiertos) > 1 ? 's' : ''} abierto${Number(incidentesAbiertos) > 1 ? 's' : ''}. Resuelve todos antes de dar de baja.`, incidentesAbiertos: Number(incidentesAbiertos) },
      { status: 409 },
    )

  const usuarioId = (session.user as any)?.id ?? null
  const ahora = new Date()

  const [actualizada] = await db.update(tiendas)
    .set({ estado: 'ARCHIVADA', archivadaEn: ahora, archivadaPorId: usuarioId, archivadaMotivo: motivo })
    .where(eq(tiendas.id, id))
    .returning()

  await db.insert(tiendasHistorial).values({
    tiendaId: id,
    usuarioId,
    campoEditado: 'estado',
    valorAnterior: 'ACTIVA',
    valorNuevo: 'ARCHIVADA',
    motivo,
  })

  return NextResponse.json(actualizada)
}
