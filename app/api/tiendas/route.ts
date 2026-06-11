import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, fichas, fichasNiveles } from '@/drizzle/schema'
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q           = searchParams.get('q') ?? ''
  const proveedorF  = searchParams.get('proveedor') ?? ''
  const clusterF    = searchParams.get('cluster') ?? ''
  const supervisorF = searchParams.get('supervisor') ?? ''

  // ── Autocomplete mode (q presente) ──────────────────────────
  if (q.length >= 2) {
    const pattern = `%${q}%`
    const rows = await db.select({
      id: tiendas.id, codigo: tiendas.codigo, nombreCc: tiendas.nombreCc,
      formato: tiendas.formato, direccion: tiendas.direccion, distrito: tiendas.distrito,
      cluster: tiendas.cluster,
      tipoConexion: fichas.tipoConexion,
      cidServicio:  fichas.cidServicio,
      instruccionReporte: tiendas.instruccionReporte,
      administradorCelular: tiendas.administradorCelular,
      celularTienda: tiendas.celularTienda,
      tieneContingencia: tiendas.tieneContingencia,
      proveedorId: tiendas.proveedorId,
      fichaActivaId: tiendas.fichaActivaId,
    })
      .from(tiendas)
      .leftJoin(fichas, eq(fichas.id, tiendas.fichaActivaId))
      .where(or(ilike(tiendas.codigo, pattern), ilike(tiendas.nombreCc, pattern)))
      .limit(8)

    const result = await Promise.all(rows.map(async t => {
      let proveedor = null
      if (t.proveedorId) {
        const [p] = await db.select({
          nombre: proveedores.nombre, instruccionGeneral: proveedores.instruccionGeneral,
          telefonoSoporte: proveedores.telefonoSoporte, correoSoporte: proveedores.correoSoporte,
        }).from(proveedores).where(eq(proveedores.id, t.proveedorId))

        // Niveles desde ficha activa de la tienda (o ficha activa del padre si es catálogo)
        let niveles: any[] = []
        const fichaId = t.fichaActivaId ?? null
        if (fichaId) {
          niveles = await db.select({
            id: fichasNiveles.id, nivel: fichasNiveles.nivel,
            nombreContacto: fichasNiveles.nombreContacto,
            email: fichasNiveles.email, celular: fichasNiveles.celular,
            tiempoRespSev1: fichasNiveles.tiempoRespSev1,
          }).from(fichasNiveles).where(eq(fichasNiveles.fichaId, fichaId))
        }
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
      tipoConexion: fichas.tipoConexion, tipoServicio: fichas.tipoServicio,
      cidServicio:  fichas.cidServicio,  tieneContingencia: tiendas.tieneContingencia,
      costoMensual: fichas.costoMensual, instruccionReporte: tiendas.instruccionReporte,
      contactoSoporte: tiendas.contactoSoporte,
      administradorNombre: tiendas.administradorNombre,
      administradorEmail: tiendas.administradorEmail,
      administradorCelular: tiendas.administradorCelular,
      celularTienda: tiendas.celularTienda,
      perfilSupervisor: tiendas.perfilSupervisor,
      contingenciaActiva: tiendas.contingenciaActiva,
      contingenciaDescripcion: tiendas.contingenciaDescripcion,
      contingenciaActivadaPor: tiendas.contingenciaActivadaPor,
      estadoServicio: fichas.estadoServicio,
    })
      .from(tiendas)
      .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
      .leftJoin(fichas, eq(fichas.id, tiendas.fichaActivaId))
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
  if (proveedorF)  filtered = filtered.filter(r => r.proveedorNombre === proveedorF)
  if (supervisorF) filtered = filtered.filter(r => r.supervisorNombre === supervisorF)

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
    tieneContingencia:   body.tieneContingencia ?? false,
    instruccionReporte:  body.instruccionReporte ?? null,
    contactoSoporte:     body.contactoSoporte ?? null,
    administradorNombre: body.administradorNombre ?? null,
    administradorEmail:  body.administradorEmail ?? null,
    administradorCelular:body.administradorCelular ?? null,
    celularTienda:       body.celularTienda ?? null,
    perfilSupervisor:    body.perfilSupervisor ?? null,
  }).returning()
  return NextResponse.json(t, { status: 201 })
}
