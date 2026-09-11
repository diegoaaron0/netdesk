import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// El transporter se crea al importar el módulo, así que se mockea nodemailer
// entero y se lee lo que sendMail le pasó.
const enviados: any[] = []
const transportes: any[] = []
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opts: any) => {
      transportes.push(opts)
      return { sendMail: async (o: any) => { enviados.push(o); return { messageId: 'x' } } }
    },
  },
}))

const resolve4 = vi.fn()
vi.mock('node:dns', () => ({ promises: { resolve4: (...a: any[]) => resolve4(...a) } }))

const ENV = { ...process.env }

beforeEach(() => {
  // El módulo cachea la IPv4 resuelta; se reimporta limpio en cada test.
  vi.resetModules()
  enviados.length = 0
  transportes.length = 0
  resolve4.mockReset()
  resolve4.mockResolvedValue(['52.97.28.194'])
  process.env.SMTP_HOST = 'smtp.test.local'
  process.env.SMTP_USER = 'netdesk@test.local'
  process.env.SMTP_FROM = 'netdesk@test.local'
  delete process.env.SMTP_OVERRIDE_TO
})
afterEach(() => { process.env = { ...ENV } })

const base = {
  to: 'proveedor@bitel.pe',
  cc: ['supervisor@footloose.pe', 'noc@bitel.pe'],
  subject: 'Incidente 00071M — T20 — Nivel 1',
  text: 'Estimados,\nReportamos avería.',
  html: '<html><body><p>Reportamos avería.</p></body></html>',
}

describe('sendMail — sin override', () => {
  it('manda al destinatario real y respeta las copias', async () => {
    const { sendMail } = await import('./mailer')
    const r = await sendMail(base)

    expect(r).toEqual({ enviado: true })
    expect(enviados[0].to).toBe('proveedor@bitel.pe')
    expect(enviados[0].cc).toBe('supervisor@footloose.pe, noc@bitel.pe')
    expect(enviados[0].subject).toBe(base.subject)
    expect(enviados[0].text).not.toContain('PRUEBA')
  })

  it('sin SMTP configurado no manda nada y lo reporta', async () => {
    delete process.env.SMTP_HOST
    const { sendMail } = await import('./mailer')
    expect(await sendMail(base)).toEqual({ enviado: false })
    expect(enviados).toHaveLength(0)
  })

  it('sin destinatarios no manda nada', async () => {
    const { sendMail } = await import('./mailer')
    expect(await sendMail({ ...base, to: [] })).toEqual({ enviado: false })
    expect(enviados).toHaveLength(0)
  })
})

// Railway no tiene salida IPv6 y nodemailer elige al azar entre las direcciones
// v4 y v6 que resuelve, asi que ~la mitad de los envios moria con ENETUNREACH.
describe('sendMail — se fuerza IPv4 (Railway no rutea IPv6)', () => {
  it('conecta a la IPv4 resuelta, no al hostname', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)

    expect(resolve4).toHaveBeenCalledWith('smtp.test.local')
    expect(transportes[0].host).toBe('52.97.28.194')
  })

  it('conserva servername para que el certificado TLS siga validando', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)
    expect(transportes[0].tls).toEqual({ servername: 'smtp.test.local' })
  })

  it('cachea la resolución — no consulta DNS en cada correo', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)
    await sendMail(base)
    expect(resolve4).toHaveBeenCalledTimes(1)
    expect(transportes.map(t => t.host)).toEqual(['52.97.28.194', '52.97.28.194'])
  })

  it('si no hay IPv4 vuelve al hostname: peor es no mandar nada', async () => {
    resolve4.mockRejectedValue(Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' }))
    const { sendMail } = await import('./mailer')

    expect(await sendMail(base)).toEqual({ enviado: true })
    expect(transportes[0].host).toBe('smtp.test.local')
    expect(transportes[0].tls).toBeUndefined()
  })

  it('si SMTP_HOST ya es una IP, no consulta DNS', async () => {
    process.env.SMTP_HOST = '52.97.28.194'
    const { sendMail } = await import('./mailer')
    await sendMail(base)

    expect(resolve4).not.toHaveBeenCalled()
    expect(transportes[0].host).toBe('52.97.28.194')
    expect(transportes[0].tls).toBeUndefined()
  })

  it('el 587 va con STARTTLS y timeouts cortos, no con los defaults de nodemailer', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)

    expect(transportes[0]).toMatchObject({
      port: 587, secure: false, requireTLS: true,
      connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
    })
  })
})

describe('sendMail — SMTP_OVERRIDE_TO (modo prueba en producción)', () => {
  beforeEach(() => { process.env.SMTP_OVERRIDE_TO = 'diego@footloose.pe' })

  it('desvía el correo a la casilla de prueba', async () => {
    const { sendMail } = await import('./mailer')
    const r = await sendMail(base)

    expect(r).toEqual({ enviado: true, redirigidoA: ['diego@footloose.pe'] })
    expect(enviados[0].to).toBe('diego@footloose.pe')
  })

  it('DESCARTA las copias — si no, el proveedor en CC igual recibiría la prueba', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)
    expect(enviados[0].cc).toBeUndefined()
  })

  it('marca el asunto y deja constancia del destinatario real', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)

    expect(enviados[0].subject).toBe('[PRUEBA] Incidente 00071M — T20 — Nivel 1')
    expect(enviados[0].text).toContain('CORREO DE PRUEBA')
    expect(enviados[0].text).toContain('proveedor@bitel.pe')
    expect(enviados[0].text).toContain('noc@bitel.pe')
    // El cuerpo original sigue entero debajo del aviso.
    expect(enviados[0].text).toContain('Reportamos avería.')
  })

  it('inserta el banner DENTRO del body del HTML, no antes del doctype', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail(base)

    expect(enviados[0].html).toMatch(/<body[^>]*><div style="background:#fff4d6/)
    expect(enviados[0].html).toContain('<p>Reportamos avería.</p>')
  })

  it('si el HTML no tiene <body>, el banner va al principio igual', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail({ ...base, html: '<p>suelto</p>' })
    expect(enviados[0].html).toMatch(/^<div style="background:#fff4d6/)
    expect(enviados[0].html).toContain('<p>suelto</p>')
  })

  it('acepta varios destinos separados por coma', async () => {
    process.env.SMTP_OVERRIDE_TO = 'diego@footloose.pe, walter@footloose.pe'
    const { sendMail } = await import('./mailer')
    const r = await sendMail(base)

    expect(enviados[0].to).toBe('diego@footloose.pe, walter@footloose.pe')
    expect(r.redirigidoA).toEqual(['diego@footloose.pe', 'walter@footloose.pe'])
  })

  it('una variable vacía no desvía nada — la app vuelve a operar normal', async () => {
    process.env.SMTP_OVERRIDE_TO = '   '
    const { sendMail } = await import('./mailer')
    const r = await sendMail(base)

    expect(r).toEqual({ enviado: true })
    expect(enviados[0].to).toBe('proveedor@bitel.pe')
    expect(enviados[0].subject).toBe(base.subject)
  })

  it('alcanza también al cron de SLA y a gestión de cambios (mismo transporte)', async () => {
    const { sendMail } = await import('./mailer')
    await sendMail({ to: 'agente@footloose.pe', subject: '🚨 SLA Respuesta VENCIDO', text: 'alerta' })
    expect(enviados[0].to).toBe('diego@footloose.pe')
    expect(enviados[0].subject).toContain('[PRUEBA]')
  })
})
