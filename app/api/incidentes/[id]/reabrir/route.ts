import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.reabrir')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const motivo: string = body.motivo ?? ''

  const horaLima = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const reabiertaInfo = motivo.trim()
    ? `Reabierto el ${horaLima} — ${motivo.trim()}`
    : `Reabierto el ${horaLima}`

  const [updated] = await db.update(incidentes)
    .set({
      estado: 'ABIERTO',
      horaFin: null,
      mttrMinutos: null,
      horaRegistro: new Date(),
      reabiertaInfo,
      actualizadoEn: new Date(),
    })
    .where(eq(incidentes.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(updated)
}
