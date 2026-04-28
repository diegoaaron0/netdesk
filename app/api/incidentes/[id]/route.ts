import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, proveedores, usuarios, escalamientos, nivelesEscalamiento } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [inc] = await db.select({
    id: incidentes.id,
    codigo: incidentes.codigo,
    tipo: incidentes.tipo,
    estado: incidentes.estado,
    nivelImpacto: incidentes.nivelImpacto,
    usuariosAfectados: incidentes.usuariosAfectados,
    descripcionInicial: incidentes.descripcionInicial,
    ticketProveedor: incidentes.ticketProveedor,
    descartesRealizados: incidentes.descartesRealizados,
    solucionAplicada: incidentes.solucionAplicada,
    horaRegistro: incidentes.horaRegistro,
    horaInicioSeguimiento: incidentes.horaInicioSeguimiento,
    horaFin: incidentes.horaFin,
    mttrMinutos: incidentes.mttrMinutos,
    observaciones: incidentes.observaciones,
    reabiertaInfo: incidentes.reabiertaInfo,
    actualizadoEn: incidentes.actualizadoEn,
    tiendaId: tiendas.id,
    tiendaCodigo: tiendas.codigo,
    tiendaNombre: tiendas.nombreCc,
    tiendaDireccion: tiendas.direccion,
    tiendaDistrito: tiendas.distrito,
    tiendaCid: tiendas.cidServicio,
    tiendaTipoConexion: tiendas.tipoConexion,
    tiendaInstruccion: tiendas.instruccionReporte,
    proveedorId: proveedores.id,
    proveedorNombre: proveedores.nombre,
    proveedorInstruccion: proveedores.instruccionGeneral,
    proveedorTelefono: proveedores.telefonoSoporte,
    agenteNombre: usuarios.nombre,
    agenteEmail: usuarios.email,
  })
    .from(incidentes)
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .leftJoin(usuarios, eq(incidentes.registradoPorId, usuarios.id))
    .where(eq(incidentes.id, id))

  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const escs = await db.select().from(escalamientos)
    .where(eq(escalamientos.incidenteId, id))

  let nivelesProveedor: any[] = []
  if (inc.proveedorId) {
    nivelesProveedor = await db.select({
      id: nivelesEscalamiento.id,
      nivel: nivelesEscalamiento.nivel,
      nombreContacto: nivelesEscalamiento.nombreContacto,
      email: nivelesEscalamiento.email,
      celular: nivelesEscalamiento.celular,
      tiempoRespSev1: nivelesEscalamiento.tiempoRespSev1,
    }).from(nivelesEscalamiento)
      .where(eq(nivelesEscalamiento.proveedorId, inc.proveedorId))
  }

  return NextResponse.json({ ...inc, escalamientos: escs, nivelesProveedor })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const allowedFields: Record<string, any> = {}
  const editable = ['estado','nivelImpacto','usuariosAfectados','tipo','descripcionInicial','ticketProveedor','descartesRealizados','solucionAplicada','horaInicioSeguimiento','observaciones','horaRegistro','horaFin','mttrMinutos']
  for (const k of editable) {
    if (k in body) allowedFields[k] = body[k]
  }

  const [updated] = await db.update(incidentes)
    .set({ ...allowedFields, actualizadoEn: new Date() })
    .where(eq(incidentes.id, id))
    .returning()

  return NextResponse.json(updated)
}
