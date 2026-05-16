import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contratosProveedor } from '@/drizzle/schema'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const [c] = await db.insert(contratosProveedor).values({
    proveedorId:          id,
    tiendaId:             body.tiendaId             ?? null,
    codigoContrato:       body.codigoContrato        ?? null,
    plan:                 body.plan                  ?? null,
    tipoServicio:         body.tipoServicio          ?? null,
    velocidadCapacidad:   body.velocidadCapacidad    ?? null,
    costoMensual:         body.costoMensual          ?? null,
    fechaInicio:          body.fechaInicio           ?? null,
    fechaFin:             body.fechaFin              ?? null,
    renovacionAutomatica: body.renovacionAutomatica  ?? false,
    penalidad:            body.penalidad             ?? null,
    slaComprometido:      body.slaComprometido       ?? null,
    tiempoRespuestaSla:   body.tiempoRespuestaSla    ?? null,
    tiempoResolucionSla:  body.tiempoResolucionSla   ?? null,
    documentoUrl:         body.documentoUrl          ?? null,
    estado:               body.estado                ?? 'VIGENTE',
  }).returning()
  return NextResponse.json(c, { status: 201 })
}
