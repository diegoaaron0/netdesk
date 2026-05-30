import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [[fromInc], [fromStandalone]] = await Promise.all([
    db.execute<{
      min_router_propio:  number | null
      min_router_externo: number | null
      min_datos_moviles:  number | null
      cnt_router_propio:  number
      cnt_router_externo: number
      cnt_datos_moviles:  number
      activo_cont:        boolean
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

        BOOL_OR(cont_activado_por IS NOT NULL AND (cont_es_externo IS FALSE OR cont_es_externo IS NULL) AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) AS activo_propio,
        BOOL_OR(cont_activado_por IS NOT NULL AND cont_es_externo IS TRUE AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) AS activo_externo,
        BOOL_OR(mov_activado_por  IS NOT NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) AS activo_mov

      FROM incidentes
      WHERE tienda_id = ${id}
    `),

    db.execute<{
      min_router_propio:  number | null
      min_router_externo: number | null
      min_datos_moviles:  number | null
      cnt_router_propio:  number
      cnt_router_externo: number
      cnt_datos_moviles:  number
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
        BOOL_OR(tipo = 'ROUTER_PROPIO'  AND hora_desactivacion IS NULL) AS activo_propio,
        BOOL_OR(tipo = 'ROUTER_EXTERNO' AND hora_desactivacion IS NULL) AS activo_externo,
        BOOL_OR(tipo = 'DATOS_MOVILES'  AND hora_desactivacion IS NULL) AS activo_mov_std
      FROM contingencias
      WHERE tienda_id = ${id}
    `),
  ])

  const inc = fromInc ?? {} as any
  const std = fromStandalone ?? {} as any

  return NextResponse.json({
    min_router_propio:  (inc.min_router_propio  ?? 0) + (std.min_router_propio  ?? 0),
    min_router_externo: (inc.min_router_externo ?? 0) + (std.min_router_externo ?? 0),
    min_datos_moviles:  (inc.min_datos_moviles  ?? 0) + (std.min_datos_moviles  ?? 0),
    cnt_router_propio:  (inc.cnt_router_propio  ?? 0) + (std.cnt_router_propio  ?? 0),
    cnt_router_externo: (inc.cnt_router_externo ?? 0) + (std.cnt_router_externo ?? 0),
    cnt_datos_moviles:  (inc.cnt_datos_moviles  ?? 0) + (std.cnt_datos_moviles  ?? 0),
    activo_propio:  (inc.activo_propio  ?? false) || (std.activo_propio  ?? false),
    activo_externo: (inc.activo_externo ?? false) || (std.activo_externo ?? false),
    activo_mov:     (inc.activo_mov     ?? false) || (std.activo_mov_std ?? false),
  })
}
