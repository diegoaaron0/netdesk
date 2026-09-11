/**
 * Diagnóstico del SMTP — herramienta temporal.
 *
 *   npx tsx scripts/test-smtp.ts              (variables locales)
 *   railway run npx tsx scripts/test-smtp.ts  (variables reales de producción)
 *
 * Va por etapas para que el fallo diga QUÉ falló, no solo "no anduvo":
 *   1. configuración      → ¿están las variables?
 *   2. DNS                → ¿resuelve el host?
 *   3. TCP                → ¿el puerto está abierto desde acá? (esto distingue
 *                           "Railway bloquea el 587" de "credenciales malas")
 *   4. verify()           → EHLO + STARTTLS + AUTH. Acá aparece el 535.
 *   5. envío real
 *
 * NUNCA imprime SMTP_PASS. Solo su largo, que alcanza para detectar una
 * contraseña pegada con espacios o vacía.
 */
import 'dotenv/config'
import net from 'node:net'
import { promises as dns } from 'node:dns'
import nodemailer from 'nodemailer'

const TIMEOUT_MS = 15000

const HOST = process.env.SMTP_HOST ?? ''
const PORT = Number(process.env.SMTP_PORT ?? 587)
const USER = process.env.SMTP_USER ?? ''
const PASS = process.env.SMTP_PASS ?? ''
const FROM = process.env.SMTP_FROM ?? USER
const DEST = process.env.SMTP_OVERRIDE_TO?.split(',')[0]?.trim() || FROM

const ok   = (m: string) => console.log(`  ✓ ${m}`)
const fail = (m: string) => console.log(`  ✗ ${m}`)
const paso = (n: number, t: string) => console.log(`\n── ${n}. ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)

/** Vuelca TODO lo que trae un error de nodemailer/net: cada campo descarta una
 *  causa distinta (code=EAUTH vs ETIMEDOUT vs ECONNREFUSED). */
function volcarError(e: any) {
  const campos = ['message', 'code', 'errno', 'syscall', 'address', 'port',
                  'command', 'responseCode', 'response', 'reason']
  for (const c of campos) {
    if (e?.[c] !== undefined) console.log(`     ${c.padEnd(13)} ${String(e[c]).replace(/\s+/g, ' ').slice(0, 400)}`)
  }
  if (e?.cause) { console.log('     cause:'); volcarError(e.cause) }
}

async function main() {
  console.log('═══ Diagnóstico SMTP — NetDesk ═══')

  paso(1, 'Configuración')
  console.log(`     SMTP_HOST        ${HOST || '(VACÍA)'}`)
  console.log(`     SMTP_PORT        ${process.env.SMTP_PORT ?? '(vacía → 587 por defecto)'}`)
  console.log(`     SMTP_USER        ${USER || '(VACÍA)'}`)
  console.log(`     SMTP_FROM        ${FROM || '(VACÍA)'}`)
  console.log(`     SMTP_OVERRIDE_TO ${process.env.SMTP_OVERRIDE_TO ?? '(vacía)'}`)
  console.log(`     SMTP_PASS        ${PASS ? `presente, ${PASS.length} caracteres` : '(VACÍA)'}`)
  console.log(`     → destino de la prueba: ${DEST || '(ninguno)'}`)

  if (PASS && PASS !== PASS.trim()) {
    fail('SMTP_PASS tiene espacios al principio o al final — Office 365 la va a rechazar.')
  }
  if (!HOST || !USER || !PASS) {
    fail('Faltan variables. Sin credenciales no se puede diagnosticar nada más.')
    console.log('\n     Corré con las variables reales:  railway run npx tsx scripts/test-smtp.ts')
    process.exit(1)
  }

  paso(2, 'DNS')
  try {
    const dirs = await dns.lookup(HOST, { all: true })
    ok(`${HOST} → ${dirs.map(d => d.address).join(', ')}`)
  } catch (e) { fail(`no resuelve ${HOST}`); volcarError(e); process.exit(1) }

  paso(3, `TCP a ${HOST}:${PORT}`)
  const saludo = await new Promise<string | null>(res => {
    const sock = net.createConnection({ host: HOST, port: PORT })
    const cerrar = (v: string | null) => { sock.destroy(); res(v) }
    sock.setTimeout(TIMEOUT_MS)
    sock.on('data',    d => cerrar(d.toString().trim()))
    sock.on('timeout', () => { fail(`timeout de ${TIMEOUT_MS / 1000}s — el puerto ${PORT} parece BLOQUEADO desde este entorno`); cerrar(null) })
    sock.on('error',   e => { fail(`no se pudo conectar al puerto ${PORT}`); volcarError(e); cerrar(null) })
  })
  if (!saludo) {
    console.log('\n     El puerto no responde: el problema es de RED, no de credenciales.')
    process.exit(1)
  }
  ok(`puerto abierto — saludo del servidor: ${saludo.split('\n')[0]}`)

  // secure:false + requireTLS:true es lo correcto para Office 365 en el 587:
  // usa STARTTLS (TLS negociado sobre la conexión en claro), no TLS directo.
  // El 465 sí es TLS directo.
  const transporter = nodemailer.createTransport({
    host: HOST, port: PORT,
    secure: PORT === 465,
    requireTLS: PORT !== 465,
    auth: { user: USER, pass: PASS },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout:   TIMEOUT_MS,
    socketTimeout:     TIMEOUT_MS,
    logger: true,
    debug:  true,
  })

  paso(4, 'EHLO + STARTTLS + AUTH (verify)')
  try {
    await transporter.verify()
    ok('autenticación aceptada')
  } catch (e: any) {
    fail('la autenticación falló')
    volcarError(e)
    console.log('\n     Cómo leer esto:')
    console.log('     · 535 5.7.139 SmtpClientAuthentication is disabled → falta habilitar SMTP AUTH')
    console.log('       en ESA casilla (el switch del tenant no alcanza; es por buzón).')
    console.log('     · 535 5.7.3 Authentication unsuccessful           → usuario/contraseña, o la cuenta')
    console.log('       tiene MFA y necesita contraseña de aplicación.')
    console.log('     · 530 5.7.57 must issue a STARTTLS command        → falta requireTLS.')
    process.exit(1)
  }

  paso(5, `Envío real a ${DEST}`)
  try {
    const info = await transporter.sendMail({
      from: FROM, to: DEST, subject: 'Test SMTP', text: 'Hola',
    })
    ok(`aceptado por el servidor — messageId ${info.messageId}`)
    console.log(`     accepted: ${JSON.stringify(info.accepted)}`)
    console.log(`     rejected: ${JSON.stringify(info.rejected)}`)
    console.log(`     response: ${info.response}`)
    console.log(`\n     Revisá ${DEST} (mirá también correo no deseado).`)
  } catch (e) {
    fail('el envío falló después de autenticar correctamente')
    volcarError(e)
    process.exit(1)
  }
}

main().catch(e => { console.error('\nError inesperado:'); volcarError(e); process.exit(1) })
