import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, nivelesEscalamiento, incidentes } from '@/drizzle/schema'
import { ilike, or, eq, and, gte, sql, count } from 'drizzle-orm'
import { auth } from '@/auth'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:     { bg: '#dbeafe', color: '#1e40af' },
  CLARO:     { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA: { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:     { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:  { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:       { bg: '#ffedd5', color: '#c2410c' },
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q') ?? ''
  const proveedorF = searchParams.get('proveedor') ?? ''
  const clusterF   = searchParams.get('cluster') ?? ''

  // ── Autocomplete mode (q presente) ──────────────────────────
  if (q.length >= 2) {
    const pattern = `%${q}%`
    const rows = await db.select({
      id: tiendas.id, codigo: tiendas.codigo, nombreCc: tiendas.nombreCc,
      formato: tiendas.formato, direccion: tiendas.direccion, distrito: tiendas.distrito,
      cluster: tiendas.cluster, tipoConexion: tiendas.tipoConexion,
      cidServicio: tiendas.cidServicio, instruccionReporte: tiendas.instruccionReporte,
      administradorCelular: tiendas.administradorCelular,
      proveedorId: tiendas.proveedorId,
    })
      .from(tiendas)
      .where(or(ilike(tiendas.codigo, pattern), ilike(tiendas.nombreCc, pattern)))
      .limit(8)

    const result = await Promise.all(rows.map(async t => {
      let proveedor = null
      if (t.proveedorId) {
        const [p] = await db.select({
          nombre: proveedores.nombre, instruccionGeneral: proveedores.instruccionGeneral,
          telefonoSoporte: proveedores.telefonoSoporte, correoSoporte: proveedores.correoSoporte,
        }).from(proveedores).where(eq(proveedores.id, t.proveedorId))
        const niveles = await db.select({
          id: nivelesEscalamiento.id, nivel: nivelesEscalamiento.nivel,
          nombreContacto: nivelesEscalamiento.nombreContacto,
          email: nivelesEscalamiento.email, celular: nivelesEscalamiento.celular,
          tiempoRespSev1: nivelesEscalamiento.tiempoRespSev1,
        }).from(nivelesEscalamiento).where(eq(nivelesEscalamiento.proveedorId, t.proveedorId))
        proveedor = p ? { ...p, niveles } : null
      }
      return { ...t, proveedor }
    }))
    return NextResponse.json(result)
  }

  // ── Full list mode (para mantenimiento) ─────────────────────
  const conditions = []
  if (clusterF) conditions.push(eq(tiendas.cluster, clusterF as any))

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [rows, counts] = await Promise.all([
    db.select({
      id: tiendas.id, codigo: tiendas.codigo, nombreCc: tiendas.nombreCc,
      formato: tiendas.formato, direccion: tiendas.direccion, referencia: tiendas.referencia,
      distrito: tiendas.distrito, provincia: tiendas.provincia, ubicacion: tiendas.ubicacion,
      cluster: tiendas.cluster, supervisorNombre: tiendas.supervisorNombre,
      proveedorId: tiendas.proveedorId, proveedorNombre: proveedores.nombre,
      tipoConexion: tiendas.tipoConexion, tipoServicio: tiendas.tipoServicio,
      cidServicio: tiendas.cidServicio, tieneContingencia: tiendas.tieneContingencia,
      costoMensual: tiendas.costoMensual, instruccionReporte: tiendas.instruccionReporte,
      contactoSoporte: tiendas.contactoSoporte,
      administradorNombre: tiendas.administradorNombre,
      administradorEmail: tiendas.administradorEmail,
      administradorCelular: tiendas.administradorCelular,
      perfilSupervisor: tiendas.perfilSupervisor,
    })
      .from(tiendas)
      .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(tiendas.codigo),

    db.select({ tiendaId: incidentes.tiendaId, total: count() })
      .from(incidentes)
      .where(gte(incidentes.horaRegistro, thirtyDaysAgo))
      .groupBy(incidentes.tiendaId),
  ])

  const countMap: Record<string, number> = {}
  for (const c of counts) if (c.tiendaId) countMap[c.tiendaId] = c.total

  let filtered = rows.map(r => ({ ...r, incidentCount: countMap[r.id] ?? 0 }))
  if (proveedorF) filtered = filtered.filter(r => r.proveedorNombre === proveedorF)

  return NextResponse.json(filtered)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes(rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const [t] = await db.insert(tiendas).values({
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
    perfilSupervisor:    body.perfilSupervisor ?? null,
  }).returning()
  return NextResponse.json(t, { status: 201 })
}
