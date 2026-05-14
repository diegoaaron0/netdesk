import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const resueltoPor       = body.resueltoPor       ?? null
  const atribucionFinal   = body.atribucionFinal   ?? null
  const evaluableProveedor = body.evaluableProveedor ?? true

  const [inc] = await db.select({ horaRegistro: incidentes.horaRegistro }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const mttrMinutos = Math.round((horaFin.getTime() - new Date(inc.horaRegistro).getTime()) / 60000)

  const [updated] = await db.update(incidentes)
    .set({ estado: 'RESUELTO', horaFin, mttrMinutos, actualizadoEn: new Date(), resueltoPor, atribucionFinal, evaluableProveedor })
    .where(eq(incidentes.id, id))
    .returning()

  return NextResponse.json(updated)
}
