import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { nivelesEscalamiento, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const [n] = await db.update(nivelesEscalamiento).set({
    nivel:                  'nivel'                  in body ? body.nivel                              : undefined,
    nombreContacto:         'nombreContacto'         in body ? (body.nombreContacto         ?? null)  : undefined,
    email:                  'email'                  in body ? (body.email                  ?? null)  : undefined,
    celular:                'celular'                in body ? (body.celular                ?? null)  : undefined,
    tiempoRespSev1:         'tiempoRespSev1'         in body ? (body.tiempoRespSev1         ?? null)  : undefined,
    correosCopia:           'correosCopia'           in body ? (body.correosCopia           ?? null)  : undefined,
    whatsapp:               'whatsapp'               in body ? (body.whatsapp               ?? null)  : undefined,
    canal:                  'canal'                  in body ? (body.canal                  ?? null)  : undefined,
    horarioAtencion:        'horarioAtencion'        in body ? (body.horarioAtencion        ?? null)  : undefined,
    tiempoEsperadoSolucion: 'tiempoEsperadoSolucion' in body ? (body.tiempoEsperadoSolucion ?? null) : undefined,
    instruccion:            'instruccion'            in body ? (body.instruccion            ?? null)  : undefined,
    activo:                 'activo'                 in body ? !!body.activo                          : undefined,
  }).where(eq(nivelesEscalamiento.id, id)).returning()
  return NextResponse.json(n)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await db.update(escalamientos).set({ nivelEscId: null }).where(eq(escalamientos.nivelEscId, id))
  await db.delete(nivelesEscalamiento).where(eq(nivelesEscalamiento.id, id))
  return NextResponse.json({ ok: true })
}
