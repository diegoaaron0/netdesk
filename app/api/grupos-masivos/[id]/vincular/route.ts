import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gruposMasivos, incidentes, tiendas } from '@/drizzle/schema'
import { eq, ilike } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'grupos.gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // Can link by incidenteId directly OR by tienda codigo (links the latest open incident)
  const { incidenteId, tiendaCodigo } = body

  const [grupo] = await db.select({ id: gruposMasivos.id }).from(gruposMasivos).where(eq(gruposMasivos.id, id))
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  if (incidenteId) {
    const [inc] = await db.update(incidentes)
      .set({ grupoMasivoId: id })
      .where(eq(incidentes.id, incidenteId))
      .returning({ id: incidentes.id, codigo: incidentes.codigo })
    if (!inc) return NextResponse.json({ error: 'Incidente no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, vinculado: inc })
  }

  if (tiendaCodigo) {
    const [tienda] = await db.select({ id: tiendas.id })
      .from(tiendas).where(ilike(tiendas.codigo, tiendaCodigo.trim()))
    if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

    // Find open incident for this tienda
    const OPEN_ESTADOS = ['ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2', 'ESCALADO_N3']
    const all = await db.select({ id: incidentes.id, codigo: incidentes.codigo, estado: incidentes.estado })
      .from(incidentes).where(eq(incidentes.tiendaId, tienda.id))
      .orderBy(incidentes.horaRegistro)
    const open = all.find(i => OPEN_ESTADOS.includes(i.estado as string))
    if (!open) return NextResponse.json({ error: 'No hay incidente abierto para esa tienda' }, { status: 404 })

    await db.update(incidentes).set({ grupoMasivoId: id }).where(eq(incidentes.id, open.id))
    return NextResponse.json({ ok: true, vinculado: open })
  }

  return NextResponse.json({ error: 'Proporciona incidenteId o tiendaCodigo' }, { status: 400 })
}
