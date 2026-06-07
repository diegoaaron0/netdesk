import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { sendMail } from '@/lib/mailer'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const userRol = (session.user as any)?.rol
  if (userRol !== 'GERENCIA' && userRol !== 'DEMO')
    return NextResponse.json({ error: 'Solo Gerencia puede aprobar acciones' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const notasAprobacion: string = body.notasAprobacion?.trim() ?? ''

  const [current] = await db.select({
    estado:           accionesGestion.estado,
    titulo:           accionesGestion.titulo,
    creadoPorId:      accionesGestion.creadoPorId,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'PROPUESTO')
    return NextResponse.json({ error: 'Solo se puede aprobar desde PROPUESTO' }, { status: 409 })

  const aprobadoPorId = (session.user as any)?.id
  const aprobadoPorNombre = (session.user as any)?.nombre ?? 'Gerencia'

  const [updated] = await db.update(accionesGestion)
    .set({
      estado:          'APROBADO',
      aprobadoPorId,
      aprobadoEn:      new Date(),
      notasAprobacion: notasAprobacion || null,
      actualizadoEn:   new Date(),
    })
    .where(eq(accionesGestion.id, id))
    .returning()

  // Notificar al responsable
  if (current.creadoPorId) {
    const [resp] = await db.select({ email: usuarios.email })
      .from(usuarios).where(eq(usuarios.id, current.creadoPorId))
    if (resp?.email) {
      sendMail({
        to: resp.email,
        subject: `✅ Acción aprobada: ${current.titulo} — NetDesk`,
        text: `Tu acción "${current.titulo}" fue aprobada por ${aprobadoPorNombre}.\n${notasAprobacion ? `Nota: ${notasAprobacion}\n` : ''}Puedes proceder a ejecutarla cuando esté lista.`,
      }).catch(() => {})
    }
  }

  return NextResponse.json(updated)
}
