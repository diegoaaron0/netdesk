import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cortesElectricos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const updates: any = {}

  if (body.horaFin !== undefined)      updates.horaFin       = body.horaFin ? new Date(body.horaFin) : null
  if (body.alcance !== undefined)      updates.alcance       = body.alcance
  if (body.tuvoUps !== undefined)      updates.tuvoUps       = body.tuvoUps
  if (body.afectoRed !== undefined)    updates.afectoRed     = body.afectoRed
  if (body.observaciones !== undefined) updates.observaciones = body.observaciones

  const [row] = await db
    .update(cortesElectricos)
    .set(updates)
    .where(eq(cortesElectricos.id, params.id))
    .returning()

  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await db.delete(cortesElectricos).where(eq(cortesElectricos.id, params.id))
  return NextResponse.json({ ok: true })
}
