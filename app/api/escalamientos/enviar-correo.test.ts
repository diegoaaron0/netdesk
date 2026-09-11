import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/mailer', () => ({
  sendMail:        vi.fn(),
  smtpConfigurado: vi.fn(),
}))

const CONTACTO = 'Enviar Correo Test Contacto'

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}
const sesionAgente = { user: { email: 'agente-mail@netdesk-test.local', rol: 'AGENTE', id: 'agente-mail-id' } } as any

let escalamientoId: string
let incidenteId: string

async function horaEnvioActual(): Promise<Date | null> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const [row] = await db.select({ h: schema.escalamientos.horaEnvioCorreo })
    .from(schema.escalamientos).where(eq(schema.escalamientos.id, escalamientoId))
  return row?.h ?? null
}

async function resetEscalamiento(horaEnvio: Date | null) {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  await db.update(schema.escalamientos)
    .set({ horaEnvioCorreo: horaEnvio, cuerpoCorreo: 'Cuerpo original guardado' })
    .where(eq(schema.escalamientos.id, escalamientoId))
}

async function postear(body: Record<string, unknown> = {}) {
  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValueOnce(sesionAgente)
  const { POST } = await import('./[id]/enviar-correo/route')
  return POST(reqCon({ cuerpo: 'Estimados,\n\nTipo de falla: Caída total', ...body }),
    { params: Promise.resolve({ id: escalamientoId }) })
}

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  incidenteId = ref.id

  await db.delete(schema.escalamientos).where(eq(schema.escalamientos.contactoEscalado, CONTACTO))
  const [esc] = await db.insert(schema.escalamientos).values({
    incidenteId, nivel: 2, contactoEscalado: CONTACTO,
    emailContacto: 'proveedor-mail@netdesk-test.local',
  }).returning()
  escalamientoId = esc.id
})

afterAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  await db.delete(schema.escalamientos).where(eq(schema.escalamientos.contactoEscalado, CONTACTO))
})

beforeEach(async () => {
  vi.clearAllMocks()
  const { smtpConfigurado, sendMail } = await import('@/lib/mailer')
  vi.mocked(smtpConfigurado).mockReturnValue(true)
  vi.mocked(sendMail).mockResolvedValue({ enviado: true })
  await resetEscalamiento(null)
})

describe('POST /api/escalamientos/[id]/enviar-correo', () => {
  it('sin sesión → 401 y no manda nada', async () => {
    const { auth } = await import('@/auth')
    const { sendMail } = await import('@/lib/mailer')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const { POST } = await import('./[id]/enviar-correo/route')
    const res = await POST(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).toBe(401)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('envío exitoso: sella hora_envio_correo y guarda el cuerpo que editó el agente', async () => {
    const res = await postear({ cuerpo: 'Texto editado por el agente' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ enviado: true, reenvio: false, destinatario: 'proveedor-mail@netdesk-test.local' })
    expect(await horaEnvioActual()).toBeInstanceOf(Date)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [row] = await db.select({ c: schema.escalamientos.cuerpoCorreo })
      .from(schema.escalamientos).where(eq(schema.escalamientos.id, escalamientoId))
    expect(row.c).toBe('Texto editado por el agente')
  })

  it('manda text plano + html con branding, y el asunto lleva código, tienda y nivel', async () => {
    const { sendMail } = await import('@/lib/mailer')
    await postear({ cuerpo: 'Asunto: viejo\n\nEstimados,\n\nTipo de falla: Caída total' })

    const arg = vi.mocked(sendMail).mock.calls[0][0]
    expect(arg.subject).toMatch(/^Incidente .+ — .+ — Nivel 2$/)
    // El asunto no se repite dentro del cuerpo: ya viaja en la cabecera SMTP.
    expect(arg.text).not.toMatch(/^Asunto:/)
    expect(arg.html).toContain('Monitoreo Footloose Perú')
    // El logo va adjunto por CID, nunca como URL remota (Outlook/Gmail las bloquean).
    expect(arg.attachments?.some(a => a.cid)).toBe(true)
  })

  // ── Decisión (b): sin SMTP, error explícito y NADA sellado ──────────────
  it('sin SMTP configurado → 503 y NO sella hora_envio_correo', async () => {
    const { smtpConfigurado, sendMail } = await import('@/lib/mailer')
    vi.mocked(smtpConfigurado).mockReturnValue(false)

    const res = await postear()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('no está configurado')
    expect(sendMail).not.toHaveBeenCalled()
    expect(await horaEnvioActual()).toBeNull()
  })

  it('si SMTP rechaza el envío → 502 con el error y NO sella (el agente puede reintentar)', async () => {
    const { sendMail } = await import('@/lib/mailer')
    vi.mocked(sendMail).mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful'))

    const res = await postear()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('535 5.7.3')
    expect(await horaEnvioActual()).toBeNull()
  })

  it('si sendMail reporta enviado:false → 503 y tampoco sella', async () => {
    const { sendMail } = await import('@/lib/mailer')
    vi.mocked(sendMail).mockResolvedValue({ enviado: false })

    const res = await postear()
    expect(res.status).toBe(503)
    expect(await horaEnvioActual()).toBeNull()
  })

  // ── Decisión (d): el reenvío no mueve el reloj de SLA ───────────────────
  it('reenvío: manda el correo otra vez pero NO pisa hora_envio_correo', async () => {
    const primerEnvio = new Date('2026-09-01T12:00:00.000Z')
    await resetEscalamiento(primerEnvio)

    const res = await postear()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ enviado: true, reenvio: true })

    const { sendMail } = await import('@/lib/mailer')
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect((await horaEnvioActual())?.toISOString()).toBe(primerEnvio.toISOString())
  })

  // ── Adjuntos ───────────────────────────────────────────────────────────
  it('adjunta las imágenes válidas al correo', async () => {
    const png = `data:image/png;base64,${Buffer.alloc(120, 3).toString('base64')}`
    await postear({ adjuntos: [{ nombre: 'captura.png', tipo: 'image/png', dataUrl: png }] })

    const { sendMail } = await import('@/lib/mailer')
    const arg = vi.mocked(sendMail).mock.calls[0][0]
    const captura = arg.attachments?.find(a => a.filename === 'captura.png')
    expect(captura?.content).toHaveLength(120)
  })

  it('adjunto inválido → 400, sin enviar ni sellar', async () => {
    const { sendMail } = await import('@/lib/mailer')
    const pdf = `data:application/pdf;base64,${Buffer.alloc(10).toString('base64')}`
    const res = await postear({ adjuntos: [{ nombre: 'doc.pdf', tipo: 'application/pdf', dataUrl: pdf }] })

    expect(res.status).toBe(400)
    expect(sendMail).not.toHaveBeenCalled()
    expect(await horaEnvioActual()).toBeNull()
  })

  it('cuerpo vacío → 400', async () => {
    const res = await postear({ cuerpo: '   ' })
    // Cae al cuerpo guardado en la BD; con ese vacío también cortaría.
    expect(res.status).toBe(200)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.update(schema.escalamientos).set({ cuerpoCorreo: null, horaEnvioCorreo: null })
      .where(eq(schema.escalamientos.id, escalamientoId))
    const res2 = await postear({ cuerpo: '' })
    expect(res2.status).toBe(400)
    expect((await res2.json()).error).toContain('vacío')
  })

  it('escalamiento inexistente → 404', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionAgente)
    const { POST } = await import('./[id]/enviar-correo/route')
    const res = await POST(reqCon({ cuerpo: 'x' }),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) })
    expect(res.status).toBe(404)
  })
})
