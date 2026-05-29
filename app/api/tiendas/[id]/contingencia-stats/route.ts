import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Duración de cada contingencia:
  // - Si tiene hora desactivacion → usa esa
  // - Si no pero el incidente está resuelto → usa hora_fin como cierre aproximado
  // - Si sigue abierto → usa NOW() para el tiempo en curso
  const [stats] = await db.execute<{
    min_router_propio:   number | null
    min_router_externo:  number | null
    min_datos_moviles:   number | null
    cnt_router_propio:   number
    cnt_router_externo:  number
    cnt_datos_moviles:   number
    activo_cont:         boolean
    activo_mov:          boolean
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
      COUNT(CASE WHEN cont_activado_por IS NOT NULL AND cont_es_externo IS TRUE                               THEN 1 END)::int AS cnt_router_externo,
      COUNT(CASE WHEN mov_activado_por  IS NOT NULL                                                           THEN 1 END)::int AS cnt_datos_moviles,

      BOOL_OR(cont_activado_por IS NOT NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) AS activo_cont,
      BOOL_OR(mov_activado_por  IS NOT NULL AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')) AS activo_mov

    FROM incidentes
    WHERE tienda_id = ${id}
  `)

  return NextResponse.json(stats ?? {
    min_router_propio: 0, min_router_externo: 0, min_datos_moviles: 0,
    cnt_router_propio: 0, cnt_router_externo: 0, cnt_datos_moviles: 0,
    activo_cont: false, activo_mov: false,
  })
}
