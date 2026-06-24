import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gruposMasivos, incidentes } from '@/drizzle/schema'
import { eq, ilike } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'grupos.gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // Se vincula por incidenteId (UUID, uso interno) o por código de incidente
  // (ej. 00099K, lo que escribe el agente). Ya NO se vincula por código de tienda.
  const { incidenteId, incidenteCodigo } = body

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

  if (incidenteCodigo) {
    const [inc] = await db.select({
      id: incidentes.id, codigo: incidentes.codigo, estado: incidentes.estado, grupoMasivoId: incidentes.grupoMasivoId,
    }).from(incidentes).where(ilike(incidentes.codigo, incidenteCodigo.trim()))

    if (!inc) return NextResponse.json({ error: `No existe el incidente ${incidenteCodigo.trim()}` }, { status: 404 })

    // Se permite cualquier estado salvo CANCELADO (no fue un incidente real).
    if (inc.estado === 'CANCELADO')
      return NextResponse.json({ error: `El incidente ${inc.codigo} está cancelado y no puede agregarse al grupo.` }, { status: 400 })

    // Si ya pertenece a OTRO grupo masivo, no se mueve: se avisa.
    if (inc.grupoMasivoId && inc.grupoMasivoId !== id) {
      const [otro] = await db.select({ codigo: gruposMasivos.codigo })
        .from(gruposMasivos).where(eq(gruposMasivos.id, inc.grupoMasivoId))
      return NextResponse.json({ error: `El incidente ${inc.codigo} ya pertenece a otro grupo masivo (${otro?.codigo ?? 'otro grupo'}).` }, { status: 409 })
    }

    await db.update(incidentes).set({ grupoMasivoId: id }).where(eq(incidentes.id, inc.id))
    return NextResponse.json({ ok: true, vinculado: inc })
  }

  return NextResponse.json({ error: 'Proporciona incidenteId o incidenteCodigo' }, { status: 400 })
}
