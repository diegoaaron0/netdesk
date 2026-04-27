import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, usuarios, tiendas, proveedores, escalamientos } from '@/drizzle/schema'
import { eq, and, ne, desc, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (rol !== 'SUPERVISOR') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const activosRaw = await db.select({
    id: incidentes.id,
    codigo: incidentes.codigo,
    estado: incidentes.estado,
    tipo: incidentes.tipo,
    nivelImpacto: incidentes.nivelImpacto,
    horaRegistro: incidentes.horaRegistro,
    agenteId: incidentes.registradoPorId,
    agenteNombre: usuarios.nombre,
    tiendaNombre: tiendas.nombreCc,
    tiendaCodigo: tiendas.codigo,
    tiendaDistrito: tiendas.distrito,
    proveedorNombre: proveedores.nombre,
  })
    .from(incidentes)
    .leftJoin(usuarios, eq(incidentes.registradoPorId, usuarios.id))
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(and(
      ne(incidentes.estado, 'RESUELTO'),
      ne(incidentes.estado, 'CANCELADO'),
      ne(incidentes.estado, 'CERRADO'),
    ))
    .orderBy(desc(incidentes.horaRegistro))

  const escalamientosActivos = await db.select({
    id: escalamientos.id,
    incidenteId: escalamientos.incidenteId,
    nivel: escalamientos.nivel,
    contactoEscalado: escalamientos.contactoEscalado,
    emailContacto: escalamientos.emailContacto,
    horaEnvioCorreo: escalamientos.horaEnvioCorreo,
    horaRespuesta: escalamientos.horaRespuesta,
    tiempoRespuestaMin: escalamientos.tiempoRespuestaMin,
    tiempoEstimadoSolucion: escalamientos.tiempoEstimadoSolucion,
    incidenteCodigo: incidentes.codigo,
    horaRegistroInc: incidentes.horaRegistro,
    tiendaNombre: tiendas.nombreCc,
  })
    .from(escalamientos)
    .leftJoin(incidentes, eq(escalamientos.incidenteId, incidentes.id))
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .where(and(
      ne(incidentes.estado, 'RESUELTO'),
      ne(incidentes.estado, 'CANCELADO'),
      ne(incidentes.estado, 'CERRADO'),
    ))
    .orderBy(desc(escalamientos.creadoEn))

  const agentes = await db.select({
    id: usuarios.id,
    nombre: usuarios.nombre,
    rol: usuarios.rol,
  })
    .from(usuarios)
    .where(sql`${usuarios.activo} = true AND ${usuarios.rol} IN ('AGENTE','SUPERVISOR')`)
    .orderBy(usuarios.nombre)

  // Build equipo: each agent with their most recent active incident
  const equipo = agentes.map(a => ({
    ...a,
    incActivo: activosRaw.find(i => i.agenteId === a.id) ?? null,
  }))

  return NextResponse.json({ activos: activosRaw, escalamientosActivos, equipo })
}
