import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (rol !== 'SUPERVISOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const fields: any = {}
  if ('nombre'   in body) fields.nombre   = body.nombre
  if ('apellido' in body) fields.apellido = body.apellido ?? null
  if ('email'    in body) fields.email    = body.email
  if ('celular'  in body) fields.celular  = body.celular ?? null
  if ('password' in body) fields.password = body.password
  if ('rol'      in body) fields.rol      = body.rol
  if ('cluster'  in body) fields.cluster  = body.cluster ?? null
  if ('activo'   in body) fields.activo   = body.activo

  const [updated] = await db.update(usuarios).set(fields).where(eq(usuarios.id, id)).returning()
  return NextResponse.json(updated)
}
