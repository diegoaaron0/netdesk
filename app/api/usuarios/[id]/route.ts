import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [u] = await db.select({ activo: usuarios.activo }).from(usuarios).where(eq(usuarios.id, id))
  if (!u) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (u.activo) return NextResponse.json({ error: 'Desactiva el usuario antes de eliminarlo' }, { status: 400 })

  try {
    await db.update(usuarios).set({ eliminadoEn: new Date() }).where(eq(usuarios.id, id))
  } catch {
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, id))
  }
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const fields: any = {}
  if ('nombre'   in body) fields.nombre   = body.nombre
  if ('apellido' in body) fields.apellido = body.apellido ?? null
  if ('email'    in body) fields.email    = body.email
  if ('celular'  in body) fields.celular  = body.celular ?? null
  if ('password' in body) fields.password = body.password
  if ('rol'      in body) fields.rol      = body.rol
  if ('cluster'  in body) fields.cluster  = body.cluster ?? null
  if ('permisos' in body) fields.permisos = body.permisos ?? null
  if ('activo'   in body) fields.activo   = body.activo

  const [updated] = await db.update(usuarios).set(fields).where(eq(usuarios.id, id)).returning()
  return NextResponse.json(updated)
}
