import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, fichasNiveles } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const niveles = await db
    .select()
    .from(fichasNiveles)
    .where(eq(fichasNiveles.fichaId, params.id))
    .orderBy(fichasNiveles.nivel)

  return NextResponse.json(niveles)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [ficha] = await db.select({ id: fichas.id }).from(fichas).where(eq(fichas.id, params.id)).limit(1)
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 })

  const body = await req.json()
  if (!body.nivel || !body.nombreContacto) {
    return NextResponse.json({ error: 'nivel y nombreContacto son obligatorios' }, { status: 400 })
  }

  const [nivel] = await db.insert(fichasNiveles).values({
    fichaId:               params.id,
    nivel:                 body.nivel,
    nombreContacto:        body.nombreContacto,
    email:                 body.email                 ?? null,
    celular:               body.celular               ?? null,
    tiempoRespSev1:        body.tiempoRespSev1        ?? null,
    tiempoRespSev2:        body.tiempoRespSev2        ?? null,
    tiempoRespSev3:        body.tiempoRespSev3        ?? null,
    correosCopia:          body.correosCopia          ?? null,
    whatsapp:              body.whatsapp              ?? null,
    canal:                 body.canal                 ?? 'correo',
    horarioAtencion:       body.horarioAtencion       ?? null,
    tiempoEsperadoSolucion: body.tiempoEsperadoSolucion ?? null,
    instruccion:           body.instruccion           ?? null,
    activo:                body.activo                ?? true,
  }).returning()

  return NextResponse.json(nivel, { status: 201 })
}
