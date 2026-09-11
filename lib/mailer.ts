import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

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
}): Promise<{ enviado: boolean }> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (recipients.length === 0) return { enviado: false }
  if (!smtpConfigurado()) {
    console.warn('[mailer] SMTP no configurado — email omitido:', subject)
    return { enviado: false }
  }
  const copias = (Array.isArray(cc) ? cc : cc ? [cc] : []).filter(Boolean)
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to:   recipients.join(', '),
    ...(copias.length > 0 ? { cc: copias.join(', ') } : {}),
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments?.length ? { attachments } : {}),
  })
  return { enviado: true }
}
