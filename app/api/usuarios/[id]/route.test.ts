import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

const EMAIL_A = 'usuario-put-a@netdesk-test.local'
const EMAIL_B = 'usuario-put-b@netdesk-test.local'
let idA: string
let idB: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  await db.delete(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_A))
  await db.delete(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_B))
  const [a] = await db.insert(schema.usuarios).values({ nombre: 'Usuario A', email: EMAIL_A, rol: 'AGENTE' }).returning()
  const [b] = await db.insert(schema.usuarios).values({ nombre: 'Usuario B', email: EMAIL_B, rol: 'AGENTE' }).returning()
  idA = a.id
  idB = b.id
})

// ─── Aislamiento del resguardo de "último administrador" ─────────────────────
// contarAdminsActivos() cuenta TODOS los usuarios activos del sistema con el
// permiso usuarios.editar, no sólo los de este archivo. netdesk_test arrastra
// usuarios SUPERVISOR de otros orígenes (semillas, pruebas manuales), así que
// "sembrar un único admin" no alcanzaba: el guard veía 4 y devolvía 200 donde
// el test esperaba 409. Los tests fallaban o no según qué hubiera en la BD.
//
// Acá se desactivan los admins ajenos antes de la corrida y se restauran al
// final. Se usa el mismo resolvePermisos + permiso que usa el endpoint, para
// que la definición de "admin" del test no pueda divergir de la del guard.
//
// Es seguro contra corridas en paralelo: ningún otro archivo de test crea
// usuarios SUPERVISOR ni DEMO (los únicos roles con usuarios.editar), así que
// la población de admins no se mueve mientras esto corre.
const PREFIJO_FIXTURE = 'admin-guard-'
let adminsAjenosDesactivados: string[] = []

async function aislarAdminsDeGuardia(): Promise<void> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { and, isNull } = await import('drizzle-orm')
  const { resolvePermisos } = await import('@/lib/permisos')

  const activos = await db.select({ id: schema.usuarios.id, email: schema.usuarios.email, rol: schema.usuarios.rol, permisos: schema.usuarios.permisos })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.activo, true), isNull(schema.usuarios.eliminadoEn)))

  const ajenos = activos.filter(u =>
    !u.email?.startsWith(PREFIJO_FIXTURE) &&
    resolvePermisos(u.rol, u.permisos).includes('usuarios.editar'))

  adminsAjenosDesactivados = ajenos.map(u => u.id)
  for (const id of adminsAjenosDesactivados) {
    await db.update(schema.usuarios).set({ activo: false } as any).where(eq(schema.usuarios.id, id))
  }
}

async function restaurarAdminsAjenos(): Promise<void> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  for (const id of adminsAjenosDesactivados) {
    await db.update(schema.usuarios).set({ activo: true } as any).where(eq(schema.usuarios.id, id))
  }
  adminsAjenosDesactivados = []
}

beforeAll(aislarAdminsDeGuardia)
afterAll(restaurarAdminsAjenos)

describe('PUT /api/usuarios/[id] — validación de email único', () => {
  it('cambiar el email de B al email de A → 400, no cambia nada', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const res = await PUT(reqCon({ email: EMAIL_A }), { params: Promise.resolve({ id: idB }) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/correo ya está registrado|ese correo/i)

    const [stillB] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, idB))
    expect(stillB.email).toBe(EMAIL_B)
  })

  it('guardar el propio email sin cambiarlo → sigue funcionando (no se bloquea a sí mismo)', async () => {
    const { PUT } = await import('./route')
    const res = await PUT(reqCon({ email: EMAIL_A, nombre: 'Usuario A Editado' }), { params: Promise.resolve({ id: idA }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.nombre).toBe('Usuario A Editado')
  })
})

// Aísla cada test del resto: desactiva cualquier sobreviviente de un test
// anterior de este mismo archivo antes de sembrar el escenario que necesita.
// Solo toca usuarios con el prefijo de email de estos fixtures (admin-guard-*),
// nunca datos reales ni de otros archivos de test.
async function limpiarAdminsDeGuardia(): Promise<void> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { like } = await import('drizzle-orm')
  await db.update(schema.usuarios).set({ activo: false } as any).where(like(schema.usuarios.email, 'admin-guard-%'))
}

async function crearAdmin(email: string): Promise<string> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
  const [u] = await db.insert(schema.usuarios).values({ nombre: email, email, rol: 'SUPERVISOR', activo: true }).returning()
  return u.id
}

describe('DELETE /api/usuarios/[id] — resguardo del último administrador', () => {
  it('con 2 admins activos, se puede eliminar (baja lógica) a uno', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { DELETE } = await import('./route')

    await limpiarAdminsDeGuardia()
    const admin1 = await crearAdmin('admin-guard-del-1@netdesk-test.local')
    await crearAdmin('admin-guard-del-2@netdesk-test.local')

    const res = await DELETE({} as any, { params: Promise.resolve({ id: admin1 }) })
    expect(res.status).toBe(200)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, admin1))
    expect(u.activo).toBe(false)
  })

  it('con 1 solo admin activo, no se puede eliminar (409), sigue activo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { DELETE } = await import('./route')

    await limpiarAdminsDeGuardia()
    const unico = await crearAdmin('admin-guard-del-unico@netdesk-test.local')

    const res = await DELETE({} as any, { params: Promise.resolve({ id: unico }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/administr|último/i)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, unico))
    expect(u.activo).toBe(true)
  })
})

describe('PUT /api/usuarios/[id] — resguardo del último administrador', () => {
  it('con 2 admins activos, se puede desactivar a uno (activo: false)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    await limpiarAdminsDeGuardia()
    const admin1 = await crearAdmin('admin-guard-put-1@netdesk-test.local')
    await crearAdmin('admin-guard-put-2@netdesk-test.local')

    const res = await PUT(reqCon({ activo: false }), { params: Promise.resolve({ id: admin1 }) })
    expect(res.status).toBe(200)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, admin1))
    expect(u.activo).toBe(false)
  })

  it('con 1 solo admin activo, no se puede desactivar (409), sigue activo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    await limpiarAdminsDeGuardia()
    const unico = await crearAdmin('admin-guard-put-unico@netdesk-test.local')

    const res = await PUT(reqCon({ activo: false }), { params: Promise.resolve({ id: unico }) })
    expect(res.status).toBe(409)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, unico))
    expect(u.activo).toBe(true)
  })

  it('con 1 solo admin activo, cambiar su rol a uno sin usuarios.editar también se bloquea (409), rol sin cambios', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    await limpiarAdminsDeGuardia()
    const unico = await crearAdmin('admin-guard-put-rol-unico@netdesk-test.local')

    const res = await PUT(reqCon({ rol: 'AGENTE' }), { params: Promise.resolve({ id: unico }) })
    expect(res.status).toBe(409)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, unico))
    expect(u.rol).toBe('SUPERVISOR')
  })

  it('con 2 admins activos, cambiar el rol de uno a AGENTE sí se permite (el otro sigue cubriendo)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    await limpiarAdminsDeGuardia()
    const admin1 = await crearAdmin('admin-guard-put-rol-1@netdesk-test.local')
    await crearAdmin('admin-guard-put-rol-2@netdesk-test.local')

    const res = await PUT(reqCon({ rol: 'AGENTE' }), { params: Promise.resolve({ id: admin1 }) })
    expect(res.status).toBe(200)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, admin1))
    expect(u.rol).toBe('AGENTE')
  })
})
