import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can, resolvePermisos } from '@/lib/permisos'

const PERMISO_ADMIN = 'usuarios.editar'
const MSG_ULTIMO_ADMIN = 'No se puede dejar al sistema sin nadie que administre usuarios — es la última persona activa con ese permiso.'

// Cuenta cuántos usuarios ACTIVOS tienen hoy, en la práctica, el permiso de
// administrar usuarios (rol ∪ personalizado — mismo cálculo que can()).
async function contarAdminsActivos(): Promise<number> {
  const activos = await db.select({ rol: usuarios.rol, permisos: usuarios.permisos })
    .from(usuarios).where(and(eq(usuarios.activo, true), isNull(usuarios.eliminadoEn)))
  return activos.filter(u => resolvePermisos(u.rol, u.permisos).includes(PERMISO_ADMIN)).length
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [u] = await db.select({ id: usuarios.id, rol: usuarios.rol, permisos: usuarios.permisos, activo: usuarios.activo })
    .from(usuarios).where(eq(usuarios.id, id))
  if (!u) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const esAdminHoy = u.activo && resolvePermisos(u.rol, u.permisos).includes(PERMISO_ADMIN)
  if (esAdminHoy && (await contarAdminsActivos()) <= 1)
    return NextResponse.json({ error: MSG_ULTIMO_ADMIN }, { status: 409 })

  await db.update(usuarios).set({ eliminadoEn: new Date(), activo: false }).where(eq(usuarios.id, id))
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  if ('email' in body) {
    const email: string = body.email?.trim() ?? ''
    if (!email) return NextResponse.json({ error: 'El correo es obligatorio' }, { status: 400 })
    const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
    if (existente && existente.id !== id) return NextResponse.json({ error: 'Ese correo ya está registrado' }, { status: 400 })
  }

  const [current] = await db.select({ rol: usuarios.rol, permisos: usuarios.permisos, activo: usuarios.activo })
    .from(usuarios).where(eq(usuarios.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const rolNuevo      = 'rol'      in body ? body.rol             : current.rol
  const permisosNuevo = 'permisos' in body ? (body.permisos ?? null) : current.permisos
  const activoNuevo   = 'activo'   in body ? !!body.activo        : current.activo

  const eraAdmin      = current.activo && resolvePermisos(current.rol, current.permisos).includes(PERMISO_ADMIN)
  const seguiraAdmin  = activoNuevo && resolvePermisos(rolNuevo, permisosNuevo).includes(PERMISO_ADMIN)
  if (eraAdmin && !seguiraAdmin && (await contarAdminsActivos()) <= 1)
    return NextResponse.json({ error: MSG_ULTIMO_ADMIN }, { status: 409 })

  type UsuarioPatch = Partial<typeof usuarios.$inferInsert>
  const fields: UsuarioPatch = {}
  if ('nombre'   in body) fields.nombre   = body.nombre
  if ('apellido' in body) fields.apellido = body.apellido ?? null
  if ('email'    in body) fields.email    = body.email?.trim()
  if ('celular'  in body) fields.celular  = body.celular ?? null
  if ('password' in body && body.password) {
    fields.password = await bcrypt.hash(body.password, 12)
    // Un admin reseteando la contraseña de otro usuario no debe quedar siendo
    // quien "sabe" la contraseña real a largo plazo — se fuerza el cambio.
    fields.debeCambiarPassword = true
  }
  if ('rol'      in body) fields.rol      = body.rol
  if ('permisos' in body) fields.permisos = body.permisos ?? null
  if ('activo'   in body) fields.activo   = body.activo

  const [updated] = await db.update(usuarios).set(fields).where(eq(usuarios.id, id)).returning()
  return NextResponse.json(updated)
}
