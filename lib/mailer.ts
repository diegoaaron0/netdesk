import nodemailer from 'nodemailer'
import { promises as dns } from 'node:dns'
import net from 'node:net'

const PUERTO = Number(process.env.SMTP_PORT ?? 587)
const TTL_DNS_MS = 5 * 60 * 1000

let cacheIpv4: { host: string; ip: string; expira: number } | null = null

/**
 * Railway no tiene ruta IPv6 de salida: cualquier conexión a una dirección v6
 * muere con ENETUNREACH.
 *
 * La opción `family: 4` de createTransport NO sirve — nodemailer 8 nunca la lee
 * en su ruta de resolución (`connect()` arma sus opciones solo con port, host,
 * allowInternalNetworkInterfaces, timeout y localAddress).
 *
 * Y el problema es peor que un orden de preferencia: nodemailer resuelve v4 y
 * v6, concatena las direcciones y después elige UNA AL AZAR
 * (lib/shared/index.js → formatDNSValue). smtp.office365.com publica 4 v6 y 4
 * v4, así que ~la mitad de los envíos caía en IPv6, sin patrón.
 *
 * La única forma fiable es conectarse a una IPv4 concreta. nodemailer detecta
 * que el host ya es una IP y la usa tal cual; `servername` mantiene la
 * validación del certificado contra el nombre real.
 */
async function ipv4De(host: string): Promise<string | null> {
  if (net.isIP(host)) return host
  const ahora = Date.now()
  if (cacheIpv4?.host === host && cacheIpv4.expira > ahora) return cacheIpv4.ip
  try {
    const [ip] = await dns.resolve4(host)
    if (!ip) return null
    cacheIpv4 = { host, ip, expira: ahora + TTL_DNS_MS }
    return ip
  } catch (e: any) {
    // Sin IPv4 se vuelve al nombre: peor es no mandar nada.
    console.warn(`[mailer] no se pudo resolver IPv4 de ${host} (${e?.code ?? e}) — se usa el nombre`)
    return null
  }
}

async function crearTransporter() {
  const host = process.env.SMTP_HOST ?? ''
  const ip   = await ipv4De(host)
  return nodemailer.createTransport({
    host: ip ?? host,
    port: PUERTO,
    // 465 es TLS directo; 587 (el de Office 365) es STARTTLS: se abre en claro y
    // se negocia TLS con el comando. requireTLS aborta si el servidor no lo
    // ofrece, en vez de mandar la contraseña sin cifrar.
    secure:     PUERTO === 465,
    requireTLS: PUERTO !== 465,
    ...(ip && ip !== host ? { tls: { servername: host } } : {}),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Sin esto rigen los defaults de nodemailer —conexión 2 min, socket 10 min—
    // y un puerto bloqueado deja el request colgado varios minutos: el agente ve
    // "Enviando…" para siempre en vez de un error que pueda leer.
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  })
}

export type AdjuntoMail = {
  filename:     string
  content:      Buffer
  contentType?: string
  /** Si viene, la imagen se incrusta en el HTML con <img src="cid:..."> en vez
   *  de colgar como archivo adjunto. */
  cid?:         string
}

/** ¿Hay credenciales SMTP? El cron lo ignora (envía o no en silencio), pero el
 *  envío manual de escalamiento LO NECESITA: sin esto sellaría hora_envio_correo
 *  afirmando que mandó un correo que nunca salió. */
export function smtpConfigurado(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER)
}

/** Modo prueba: con SMTP_OVERRIDE_TO seteada, TODO correo se desvía a esa
 *  casilla — escalamientos, alertas de SLA y gestión de cambios. Sirve para
 *  probar en producción sin escribirle a los proveedores. Se borra la variable
 *  cuando termina la validación.
 *  Acepta varios destinos separados por coma. */
export function destinoOverride(): string[] {
  return (process.env.SMTP_OVERRIDE_TO ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

/** Deja constancia visible de que el correo fue desviado. Sin esto, quien lo
 *  recibe no puede distinguir una prueba de un correo real, ni saber a quién
 *  habría llegado en producción. */
function marcarDesvio(destinos: { to: string[]; cc: string[] }) {
  const real = [
    `Para: ${destinos.to.join(', ')}`,
    ...(destinos.cc.length ? [`CC: ${destinos.cc.join(', ')}`] : []),
  ].join(' · ')
  return {
    asunto: `[PRUEBA] `,
    texto:  `*** CORREO DE PRUEBA — desviado por SMTP_OVERRIDE_TO ***\nDestinatario real: ${real}\n\n`,
    html:   `<div style="background:#fff4d6;border:1px solid #e0b44a;border-radius:8px;padding:10px 14px;margin:0 0 12px;font:600 12px/1.5 Segoe UI,Arial,sans-serif;color:#6b4c07;">`
          + `CORREO DE PRUEBA — desviado por <code>SMTP_OVERRIDE_TO</code>.<br>`
          + `<span style="font-weight:400;">Destinatario real: ${real}</span></div>`,
  }
}

/** Envía un correo. `enviado` distingue "se mandó" de "se omitió por falta de
 *  configuración" — los dos casos antes devolvían lo mismo (void) y eran
 *  indistinguibles para el que llamaba. */
export async function sendMail({ to, subject, text, cc, html, attachments }: {
  to: string | string[]
  subject: string
  text: string
  cc?: string | string[] | null
  html?: string
  attachments?: AdjuntoMail[]
}): Promise<{ enviado: boolean; redirigidoA?: string[] }> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (recipients.length === 0) return { enviado: false }
  if (!smtpConfigurado()) {
    console.warn('[mailer] SMTP no configurado — email omitido:', subject)
    return { enviado: false }
  }
  let copias = (Array.isArray(cc) ? cc : cc ? [cc] : []).filter(Boolean)

  // El desvío se aplica acá, en el único transporte que tiene la app, para que
  // ninguna ruta pueda saltearlo. Las copias se DESCARTAN: dejarlas mandaría el
  // correo de prueba a los proveedores, que es justo lo que se quiere evitar.
  const override = destinoOverride()
  let destinos = recipients
  if (override.length > 0) {
    const marca = marcarDesvio({ to: recipients, cc: copias })
    console.warn(`[mailer] SMTP_OVERRIDE_TO activo — "${subject}" desviado de ${recipients.join(', ')} a ${override.join(', ')}`)
    destinos = override
    copias   = []
    subject  = marca.asunto + subject
    text     = marca.texto + text
    if (html) {
      html = /<body[^>]*>/i.test(html)
        ? html.replace(/(<body[^>]*>)/i, `$1${marca.html}`)
        : marca.html + html
    }
  }

  const transporter = await crearTransporter()
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to:   destinos.join(', '),
    ...(copias.length > 0 ? { cc: copias.join(', ') } : {}),
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments?.length ? { attachments } : {}),
  })
  return { enviado: true, ...(override.length > 0 ? { redirigidoA: override } : {}) }
}
