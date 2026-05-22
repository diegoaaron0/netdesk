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

export async function sendMail({ to, subject, text }: {
  to: string | string[]
  subject: string
  text: string
}) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (recipients.length === 0) return
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[mailer] SMTP no configurado — email omitido:', subject)
    return
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to:   recipients.join(', '),
    subject,
    text,
  })
}
