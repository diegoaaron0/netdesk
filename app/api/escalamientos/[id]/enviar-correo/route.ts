import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { escalamientos, incidentes, tiendas, fichasNiveles } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail, smtpConfigurado, type AdjuntoMail } from '@/lib/mailer'
import {
  asuntoEscalamiento, htmlEscalamiento, quitarAsuntoDelCuerpo,
  validarAdjuntos, LOGO_CID,
} from '@/lib/correo-escalamiento'

const MSG_SIN_SMTP =
  'El envío de correo no está configurado en este entorno (faltan credenciales SMTP). ' +
  'Mandá el correo desde tu cliente y registrálo con "Ya lo mandé por fuera".'

/** El logo viaja adjunto al correo y se referencia por CID. Si no se puede
 *  leer, el correo sale igual sin imagen (queda el texto alternativo): un logo
 *  faltante nunca debe frenar un escalamiento. */
async function leerLogo(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'logo-netdesk.png'))
  } catch (e) {
    console.warn('[enviar-correo] no se pudo leer el logo:', e)
    return null
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))

  const [row] = await db.select({
    nivel:           escalamientos.nivel,
    emailContacto:   escalamientos.emailContacto,
    horaEnvioCorreo: escalamientos.horaEnvioCorreo,
    cuerpoGuardado:  escalamientos.cuerpoCorreo,
    fichaNivelId:    escalamientos.fichaNivelId,
    codigo:          incidentes.codigo,
    tiendaCodigo:    tiendas.codigo,
    tiendaNombre:    tiendas.nombreCc,
  })
    .from(escalamientos)
    .innerJoin(incidentes, eq(incidentes.id, escalamientos.incidenteId))
    .leftJoin(tiendas, eq(tiendas.id, incidentes.tiendaId))
    .where(eq(escalamientos.id, id))

  if (!row) return NextResponse.json({ error: 'Escalamiento no encontrado' }, { status: 404 })

  const cuerpo = (typeof body.cuerpo === 'string' && body.cuerpo.trim())
    ? body.cuerpo
    : (row.cuerpoGuardado ?? '')
  if (!cuerpo.trim()) {
    return NextResponse.json({ error: 'El cuerpo del correo está vacío.' }, { status: 400 })
  }
  if (!row.emailContacto?.trim()) {
    return NextResponse.json(
      { error: 'Este nivel de escalamiento no tiene correo de contacto cargado en la ficha.' },
      { status: 400 })
  }

  const adj = validarAdjuntos(body.adjuntos)
  if (!adj.ok) return NextResponse.json({ error: adj.error }, { status: 400 })

  // Se corta ANTES de enviar y de sellar: decirle al agente "enviado" cuando no
  // hay SMTP arrancaría el reloj de SLA sobre un correo que nunca salió.
  if (!smtpConfigurado()) return NextResponse.json({ error: MSG_SIN_SMTP }, { status: 503 })

  let cc: string[] = []
  if (row.fichaNivelId) {
    const [nivelFicha] = await db.select({ correosCopia: fichasNiveles.correosCopia })
      .from(fichasNiveles).where(eq(fichasNiveles.id, row.fichaNivelId))
    cc = (nivelFicha?.correosCopia ?? []).filter(Boolean)
  }

  const attachments: AdjuntoMail[] = adj.archivos.map(a => ({
    filename: a.filename, content: Buffer.from(a.base64, 'base64'), contentType: a.contentType,
  }))
  const logo = await leerLogo()
  if (logo) attachments.push({ filename: 'netdesk.png', content: logo, contentType: 'image/png', cid: LOGO_CID })

  let redirigidoA: string[] | undefined
  try {
    const { enviado, redirigidoA: rd } = await sendMail({
      to:      row.emailContacto,
      cc,
      subject: asuntoEscalamiento({
        codigo: row.codigo, nivel: row.nivel,
        tiendaCodigo: row.tiendaCodigo, tiendaNombre: row.tiendaNombre,
      }),
      text:    quitarAsuntoDelCuerpo(cuerpo),
      html:    htmlEscalamiento({ cuerpo, codigo: row.codigo, nivel: row.nivel }),
      attachments,
    })
    if (!enviado) return NextResponse.json({ error: MSG_SIN_SMTP }, { status: 503 })
    redirigidoA = rd
  } catch (e: any) {
    console.error(`[enviar-correo] fallo SMTP en escalamiento ${id}:`, e)
    return NextResponse.json(
      { error: `El servidor de correo rechazó el envío: ${e?.message ?? 'error desconocido'}` },
      { status: 502 })
  }

  // Solo se llega acá si el correo salió. El reenvío NO pisa hora_envio_correo:
  // el SLA se mide desde el primer envío.
  const esPrimerEnvio = !row.horaEnvioCorreo
  const cambios: Record<string, unknown> = { cuerpoCorreo: cuerpo }
  if (esPrimerEnvio) {
    cambios.horaEnvioCorreo  = new Date()
    cambios.estadoCronometro = 'CORRIENDO'
  }
  const [updated] = await db.update(escalamientos).set(cambios).where(eq(escalamientos.id, id)).returning()

  return NextResponse.json({
    enviado:      true,
    reenvio:      !esPrimerEnvio,
    destinatario: row.emailContacto,
    cc,
    adjuntos:     adj.archivos.length,
    // Modo prueba: el agente tiene que saber que el proveedor NO lo recibió.
    ...(redirigidoA ? { redirigidoA } : {}),
    escalamiento: updated,
  })
}
