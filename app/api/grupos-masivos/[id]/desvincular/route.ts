import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'grupos.gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const { incidenteId } = await req.json()
  if (!incidenteId) return NextResponse.json({ error: 'incidenteId requerido' }, { status: 400 })

  await db.update(incidentes)
    .set({ grupoMasivoId: null })
    .where(and(eq(incidentes.id, incidenteId), eq(incidentes.grupoMasivoId, id)))

  return NextResponse.json({ ok: true })
}
