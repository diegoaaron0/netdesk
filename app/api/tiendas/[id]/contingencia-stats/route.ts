import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql, eq, and, gte, lt, notInArray } from 'drizzle-orm'
import { incidentes } from '@/drizzle/schema'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getTramosPorIncidentes, normalizarMitigaciones, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

const ESTADOS_CERRADOS = ['RESUELTO', 'CANCELADO', 'CERRADO'] as const

// Columnas que normalizarMitigaciones necesita para derivar segmentos legacy
// cuando el incidente todavía no tiene tramos.
const COLS_MITIGACION = {
  id:                     incidentes.id,
  estado:                 incidentes.estado,
  tipo:                   incidentes.tipo,
  horaRegistro:           incidentes.horaRegistro,
  horaFin:                incidentes.horaFin,
  contActivadoPor:        incidentes.contActivadoPor,
  contHoraActivacion:     incidentes.contHoraActivacion,
  contHoraDesactivacion:  incidentes.contHoraDesactivacion,
  contRendimiento:        incidentes.contRendimiento,
  contEsExterno:          incidentes.contEsExterno,
  movActivadoPor:         incidentes.movActivadoPor,
  movHoraActivacion:      incidentes.movHoraActivacion,
  movHoraDesactivacion:   incidentes.movHoraDesactivacion,
  movRendimiento:         incidentes.movRendimiento,
  mitigacionesPrevias:    incidentes.mitigacionesPrevias,
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  const hastaStr = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desdeStr = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : '1970-01-01T00:00:00Z'
  const desde = new Date(desdeStr)
  const hasta = new Date(hastaStr)

  const ahora = new Date()

  // ── Minutos y conteos por tipo, del período — Fase 5, Paso 2.2 ─────────────
  // Antes: SUM/COUNT en SQL crudo sobre cont_*/mov_* + una tercera query aparte
  // sobre mitigaciones_previas (jsonb). Ahora: se trae cada incidente del
  // período con sus tramos (si los tiene) y normalizarMitigaciones deriva los
  // segmentos — con tramos o sin ellos (legacy + mitigaciones_previas ya
  // fusionados ahí adentro). El total se redondea una sola vez al final, igual
  // que hacía el ::int de Postgres sobre el SUM.
  const incsPeriodo = await db.select(COLS_MITIGACION).from(incidentes).where(and(
    eq(incidentes.tiendaId, id),
    gte(incidentes.horaRegistro, desde),
    lt(incidentes.horaRegistro, hasta),
  ))

  const tramosPeriodo = await getTramosPorIncidentes(incsPeriodo.map(i => i.id))

  let minRouterPropio = 0, minRouterExterno = 0, minDatosMoviles = 0
  let cntRouterPropio = 0, cntRouterExterno = 0, cntDatosMoviles = 0

  for (const inc of incsPeriodo) {
    const segmentos = normalizarMitigaciones(inc as IncidenteMitigacionInput, tramosPeriodo.get(inc.id) ?? [])
    for (const s of segmentos) {
      if (s.tipo !== 'ROUTER_PROPIO' && s.tipo !== 'ROUTER_EXTERNO' && s.tipo !== 'DATOS_MOVILES') continue
      const minutos = ((s.hasta ?? ahora).getTime() - s.desde.getTime()) / 60000
      if (s.tipo === 'ROUTER_PROPIO')       { minRouterPropio  += minutos; cntRouterPropio++ }
      else if (s.tipo === 'ROUTER_EXTERNO') { minRouterExterno += minutos; cntRouterExterno++ }
      else                                  { minDatosMoviles  += minutos; cntDatosMoviles++ }
    }
  }

  // ── Estado "activo ahora mismo" — sin filtro de período, igual que antes ──
  // Escanea todos los incidentes NO cerrados de la tienda (cualquier hora_registro)
  // y se fija si alguno tiene un segmento real todavía abierto (hasta=null).
  const incsAbiertos = await db.select(COLS_MITIGACION).from(incidentes).where(and(
    eq(incidentes.tiendaId, id),
    notInArray(incidentes.estado, ESTADOS_CERRADOS as any),
  ))

  const tramosAbiertos = await getTramosPorIncidentes(incsAbiertos.map(i => i.id))

  let activoPropio = false, activoExterno = false, activoMov = false
  for (const inc of incsAbiertos) {
    const segmentos = normalizarMitigaciones(inc as IncidenteMitigacionInput, tramosAbiertos.get(inc.id) ?? [])
    for (const s of segmentos) {
      if (s.hasta !== null) continue
      if (s.tipo === 'ROUTER_PROPIO') activoPropio = true
      else if (s.tipo === 'ROUTER_EXTERNO') activoExterno = true
      else if (s.tipo === 'DATOS_MOVILES') activoMov = true
    }
  }

  // ── Contingencias standalone — SIN TOCAR (tabla aparte, fuera de esta migración) ──
  const [fromStandalone] = await db.execute<{
    min_router_propio:  number | null
    min_router_externo: number | null
    min_datos_moviles:  number | null
    cnt_router_propio:  number
    cnt_router_externo: number
    cnt_datos_moviles:  number
    activo_propio:      boolean
    activo_externo:     boolean
    activo_mov_std:     boolean
  }>(sql`
    SELECT
      SUM(CASE WHEN tipo = 'ROUTER_PROPIO'
        THEN EXTRACT(EPOCH FROM (COALESCE(hora_desactivacion, NOW()) - hora_activacion)) / 60
        ELSE 0 END)::int AS min_router_propio,
      SUM(CASE WHEN tipo = 'ROUTER_EXTERNO'
        THEN EXTRACT(EPOCH FROM (COALESCE(hora_desactivacion, NOW()) - hora_activacion)) / 60
        ELSE 0 END)::int AS min_router_externo,
      SUM(CASE WHEN tipo = 'DATOS_MOVILES'
        THEN EXTRACT(EPOCH FROM (COALESCE(hora_desactivacion, NOW()) - hora_activacion)) / 60
        ELSE 0 END)::int AS min_datos_moviles,
      COUNT(CASE WHEN tipo = 'ROUTER_PROPIO'  THEN 1 END)::int AS cnt_router_propio,
      COUNT(CASE WHEN tipo = 'ROUTER_EXTERNO' THEN 1 END)::int AS cnt_router_externo,
      COUNT(CASE WHEN tipo = 'DATOS_MOVILES'  THEN 1 END)::int AS cnt_datos_moviles,
      -- activo_* sin filtro de período — estado actual
      (SELECT BOOL_OR(tipo = 'ROUTER_PROPIO'  AND hora_desactivacion IS NULL) FROM contingencias WHERE tienda_id = ${id}) AS activo_propio,
      (SELECT BOOL_OR(tipo = 'ROUTER_EXTERNO' AND hora_desactivacion IS NULL) FROM contingencias WHERE tienda_id = ${id}) AS activo_externo,
      (SELECT BOOL_OR(tipo = 'DATOS_MOVILES'  AND hora_desactivacion IS NULL) FROM contingencias WHERE tienda_id = ${id}) AS activo_mov_std
    FROM contingencias
    WHERE tienda_id = ${id}
      AND hora_activacion >= ${desdeStr}::timestamptz
      AND hora_activacion <  ${hastaStr}::timestamptz
  `)

  const std = fromStandalone ?? {} as any

  return NextResponse.json({
    min_router_propio:  Math.round(minRouterPropio)  + (std.min_router_propio  ?? 0),
    min_router_externo: Math.round(minRouterExterno) + (std.min_router_externo ?? 0),
    min_datos_moviles:  Math.round(minDatosMoviles)  + (std.min_datos_moviles  ?? 0),
    cnt_router_propio:  cntRouterPropio  + (std.cnt_router_propio  ?? 0),
    cnt_router_externo: cntRouterExterno + (std.cnt_router_externo ?? 0),
    cnt_datos_moviles:  cntDatosMoviles  + (std.cnt_datos_moviles  ?? 0),
    activo_propio:  activoPropio  || (std.activo_propio  ?? false),
    activo_externo: activoExterno || (std.activo_externo ?? false),
    activo_mov:     activoMov     || (std.activo_mov_std ?? false),
  })
}
