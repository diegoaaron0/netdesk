import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { nivelesEscalamiento } from '@/drizzle/schema'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const [n] = await db.insert(nivelesEscalamiento).values({
    proveedorId:             id,
    nivel:                   body.nivel,
    nombreContacto:          body.nombreContacto,
    email:                   body.email               ?? null,
    celular:                 body.celular             ?? null,
    tiempoRespSev1:          body.tiempoRespSev1      ?? null,
    correosCopia:            body.correosCopia        ?? null,
    whatsapp:                body.whatsapp            ?? null,
    canal:                   body.canal               ?? 'correo',
    horarioAtencion:         body.horarioAtencion     ?? null,
    tiempoEsperadoSolucion:  body.tiempoEsperadoSolucion ?? null,
    instruccion:             body.instruccion         ?? null,
    activo:                  body.activo              ?? true,
  }).returning()
  return NextResponse.json(n, { status: 201 })
}
