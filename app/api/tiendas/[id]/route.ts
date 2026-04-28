import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes(rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const [updated] = await db.update(tiendas).set({
    codigo:              body.codigo,
    nombreCc:            body.nombreCc ?? null,
    formato:             body.formato ?? null,
    direccion:           body.direccion ?? null,
    referencia:          body.referencia ?? null,
    distrito:            body.distrito ?? null,
    provincia:           body.provincia ?? null,
    ubicacion:           body.ubicacion ?? null,
    cluster:             body.cluster ?? null,
    supervisorNombre:    body.supervisorNombre ?? null,
    proveedorId:         body.proveedorId ?? null,
    tipoConexion:        body.tipoConexion ?? null,
    tipoServicio:        body.tipoServicio ?? null,
    cidServicio:         body.cidServicio ?? null,
    tieneContingencia:   body.tieneContingencia ?? false,
    costoMensual:        body.costoMensual ?? null,
    instruccionReporte:  body.instruccionReporte ?? null,
    contactoSoporte:     body.contactoSoporte ?? null,
    administradorNombre: body.administradorNombre ?? null,
    administradorEmail:  body.administradorEmail ?? null,
    administradorCelular:body.administradorCelular ?? null,
  }).where(eq(tiendas.id, id)).returning()

  return NextResponse.json(updated)
}
