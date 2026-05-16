import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contratosProveedor } from '@/drizzle/schema'
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
  const [c] = await db.update(contratosProveedor).set({
    tiendaId:             'tiendaId'             in body ? (body.tiendaId             ?? null) : undefined,
    codigoContrato:       'codigoContrato'       in body ? (body.codigoContrato       ?? null) : undefined,
    plan:                 'plan'                 in body ? (body.plan                 ?? null) : undefined,
    tipoServicio:         'tipoServicio'         in body ? (body.tipoServicio         ?? null) : undefined,
    velocidadCapacidad:   'velocidadCapacidad'   in body ? (body.velocidadCapacidad   ?? null) : undefined,
    costoMensual:         'costoMensual'         in body ? (body.costoMensual         ?? null) : undefined,
    fechaInicio:          'fechaInicio'          in body ? (body.fechaInicio          ?? null) : undefined,
    fechaFin:             'fechaFin'             in body ? (body.fechaFin             ?? null) : undefined,
    renovacionAutomatica: 'renovacionAutomatica' in body ? !!body.renovacionAutomatica           : undefined,
    penalidad:            'penalidad'            in body ? (body.penalidad            ?? null) : undefined,
    slaComprometido:      'slaComprometido'      in body ? (body.slaComprometido      ?? null) : undefined,
    tiempoRespuestaSla:   'tiempoRespuestaSla'   in body ? (body.tiempoRespuestaSla   ?? null) : undefined,
    tiempoResolucionSla:  'tiempoResolucionSla'  in body ? (body.tiempoResolucionSla  ?? null) : undefined,
    documentoUrl:         'documentoUrl'         in body ? (body.documentoUrl         ?? null) : undefined,
    estado:               'estado'               in body ? (body.estado               ?? null) : undefined,
  }).where(eq(contratosProveedor.id, id)).returning()
  return NextResponse.json(c)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await db.delete(contratosProveedor).where(eq(contratosProveedor.id, id))
  return NextResponse.json({ ok: true })
}
