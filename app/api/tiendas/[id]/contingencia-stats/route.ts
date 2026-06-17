import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : '1970-01-01T00:00:00Z'

  const [[fromInc], [fromStandalone], [fromPrevias]] = await Promise.all([
    db.execute<{
      min_router_propio:  number | null
      min_router_externo: number | null
      min_datos_moviles:  number | null
      cnt_router_propio:  number
      cnt_router_externo: number
      cnt_datos_moviles:  number
      activo_propio:      boolean
      activo_externo:     boolean
      activo_mov:         boolean
    }>(sql`
      SELECT
        SUM(CASE
          WHEN cont_activado_por IS NOT NULL AND (cont_es_externo IS FALSE OR cont_es_externo IS NULL)
            AND cont_hora_activacion IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            COALESCE(cont_hora_desactivacion, hora_fin, NOW())
            - cont_hora_activacion
          )) / 60
          ELSE 0
        END)::int  AS min_router_propio,

        SUM(CASE
          WHEN cont_activado_por IS NOT NULL AND cont_es_externo IS TRUE
            AND cont_hora_activacion IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            COALESCE(cont_hora_desactivacion, hora_fin, NOW())
            - cont_hora_activacion
          )) / 60
          ELSE 0
        END)::int  AS min_router_externo,

        SUM(CASE
          WHEN mov_activado_por IS NOT NULL
            AND mov_hora_activacion IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            COALESCE(mov_hora_desactivacion, hora_fin, NOW())
            - mov_hora_activacion
          )) / 60
          ELSE 0
        END)::int  AS min_datos_moviles,

        COUNT(CASE WHEN cont_activado_por IS NOT NULL AND (cont_es_externo IS FALSE OR cont_es_externo IS NULL) THEN 1 END)::int AS cnt_router_propio,
        COUNT(CASE WHEN cont_activado_por IS NOT NULL AND cont_es_externo IS TRUE THEN 1 END)::int AS cnt_router_externo,
        COUNT(CASE WHEN mov_activado_por IS NOT NULL THEN 1 END)::int AS cnt_datos_moviles,

        -- activo_* siempre refleja estado actual, sin filtro de período
        (SELECT BOOL_OR(cont_activado_por IS NOT NULL AND (cont_es_externo IS FALSE OR cont_es_externo IS NULL) AND cont_hora_desactivacion IS NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) FROM incidentes WHERE tienda_id = ${id}) AS activo_propio,
        (SELECT BOOL_OR(cont_activado_por IS NOT NULL AND cont_es_externo IS TRUE AND cont_hora_desactivacion IS NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) FROM incidentes WHERE tienda_id = ${id}) AS activo_externo,
        (SELECT BOOL_OR(mov_activado_por IS NOT NULL AND mov_hora_desactivacion IS NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) FROM incidentes WHERE tienda_id = ${id}) AS activo_mov

      FROM incidentes
      WHERE tienda_id = ${id}
        AND hora_registro >= ${desde}::timestamptz
        AND hora_registro <  ${hasta}::timestamptz
    `),

    db.execute<{
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
        AND hora_activacion >= ${desde}::timestamptz
        AND hora_activacion <  ${hasta}::timestamptz
    `),

    // Mitigaciones de periodos anteriores archivadas al reabrir un incidente.
    // El slot vivo (cont_*/mov_*) se libera en reabrir, así que sus minutos ya no
    // están en `fromInc`; se recuperan aquí desde mitigaciones_previas (jsonb).
    db.execute<{
      min_router_propio:  number | null
      min_router_externo: number | null
      min_datos_moviles:  number | null
      cnt_router_propio:  number
      cnt_router_externo: number
      cnt_datos_moviles:  number
    }>(sql`
      SELECT
        SUM(CASE WHEN e->>'clase' = 'ROUTER_PROPIO'
          THEN EXTRACT(EPOCH FROM ((e->>'horaDesactivacion')::timestamptz - (e->>'horaActivacion')::timestamptz)) / 60
          ELSE 0 END)::int AS min_router_propio,
        SUM(CASE WHEN e->>'clase' = 'ROUTER_EXTERNO'
          THEN EXTRACT(EPOCH FROM ((e->>'horaDesactivacion')::timestamptz - (e->>'horaActivacion')::timestamptz)) / 60
          ELSE 0 END)::int AS min_router_externo,
        SUM(CASE WHEN e->>'clase' = 'DATOS_MOVILES'
          THEN EXTRACT(EPOCH FROM ((e->>'horaDesactivacion')::timestamptz - (e->>'horaActivacion')::timestamptz)) / 60
          ELSE 0 END)::int AS min_datos_moviles,
        COUNT(CASE WHEN e->>'clase' = 'ROUTER_PROPIO'  THEN 1 END)::int AS cnt_router_propio,
        COUNT(CASE WHEN e->>'clase' = 'ROUTER_EXTERNO' THEN 1 END)::int AS cnt_router_externo,
        COUNT(CASE WHEN e->>'clase' = 'DATOS_MOVILES'  THEN 1 END)::int AS cnt_datos_moviles
      FROM incidentes i
      CROSS JOIN LATERAL jsonb_array_elements(i.mitigaciones_previas) e
      WHERE i.tienda_id = ${id}
        AND i.mitigaciones_previas IS NOT NULL
        AND (e->>'horaActivacion') IS NOT NULL
        AND (e->>'horaDesactivacion') IS NOT NULL
        AND i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
    `),
  ])

  const inc = fromInc ?? {} as any
  const std = fromStandalone ?? {} as any
  const prev = fromPrevias ?? {} as any

  return NextResponse.json({
    min_router_propio:  (inc.min_router_propio  ?? 0) + (std.min_router_propio  ?? 0) + (prev.min_router_propio  ?? 0),
    min_router_externo: (inc.min_router_externo ?? 0) + (std.min_router_externo ?? 0) + (prev.min_router_externo ?? 0),
    min_datos_moviles:  (inc.min_datos_moviles  ?? 0) + (std.min_datos_moviles  ?? 0) + (prev.min_datos_moviles  ?? 0),
    cnt_router_propio:  (inc.cnt_router_propio  ?? 0) + (std.cnt_router_propio  ?? 0) + (prev.cnt_router_propio  ?? 0),
    cnt_router_externo: (inc.cnt_router_externo ?? 0) + (std.cnt_router_externo ?? 0) + (prev.cnt_router_externo ?? 0),
    cnt_datos_moviles:  (inc.cnt_datos_moviles  ?? 0) + (std.cnt_datos_moviles  ?? 0) + (prev.cnt_datos_moviles  ?? 0),
    activo_propio:  (inc.activo_propio  ?? false) || (std.activo_propio  ?? false),
    activo_externo: (inc.activo_externo ?? false) || (std.activo_externo ?? false),
    activo_mov:     (inc.activo_mov     ?? false) || (std.activo_mov_std ?? false),
  })
}
