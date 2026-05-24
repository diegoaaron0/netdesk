import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { apiKeyAuth, parseDateRange } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const authErr = apiKeyAuth(req)
  if (authErr) return authErr

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)

  const rows = await db.execute(sql`
    SELECT
      COALESCE(pi.nombre, pt.nombre)                                                AS proveedor,
      COUNT(i.id)::int                                                               AS total_incidentes,
      COUNT(i.id) FILTER (WHERE i.estado = 'RESUELTO')::int                         AS resueltos,
      COUNT(i.id) FILTER (WHERE i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO'))::int AS activos,
      ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int          AS mttr_promedio_min,
      -- SLA resolución
      ROUND(
        COUNT(*) FILTER (
          WHERE i.estado = 'RESUELTO' AND i.mttr_minutos IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE
            AND i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL'   THEN 60  WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'      THEN 240 WHEN 'POS'           THEN 60
              ELSE 120 END
        ) * 100.0 /
        NULLIF(COUNT(*) FILTER (
          WHERE i.estado = 'RESUELTO' AND i.evaluable_proveedor IS NOT FALSE
        ), 0)
      )::int                                                                         AS sla_resolucion_pct,
      -- SLA respuesta N1
      ROUND(
        COUNT(*) FILTER (
          WHERE n1.hora_resp IS NOT NULL AND n1.hora_envio IS NOT NULL
            AND EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60 <= 60
        ) * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE n1.hora_envio IS NOT NULL), 0)
      )::int                                                                         AS sla_respuesta_pct,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60
      ) FILTER (WHERE n1.hora_resp IS NOT NULL))::int                                AS t_respuesta_prom_min,
      -- Escalamientos
      COUNT(DISTINCT i.id) FILTER (WHERE esc_max.nivel_max >= 2)::int               AS incidentes_escalados_n2,
      COUNT(DISTINCT i.id) FILTER (WHERE esc_max.nivel_max >= 3)::int               AS incidentes_escalados_n3,
      -- Tiendas
      COUNT(DISTINCT i.tienda_id)::int                                               AS tiendas_afectadas,
      -- IEI con factores 3-tier
      ROUND(SUM(
        COALESCE(
          t.venta_hora_soles::numeric,
          CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
            WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END::numeric
        )
        * (COALESCE(i.mttr_minutos, 0)::numeric / 60)
        * 0.35
        * CASE i.tipo
            WHEN 'CAIDA_TOTAL' THEN
              CASE WHEN i.boleta_manual = true THEN 0.40
                   WHEN i.cont_activado_por IS NOT NULL THEN
                     CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                    THEN 0.10
                          WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                  THEN 0.30
                          WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 1.00
                          ELSE 0.25 END
                   WHEN i.venta_parcial = true THEN 0.50
                   ELSE 1.00 END
            WHEN 'INTERMITENCIA' THEN
              CASE WHEN i.cont_activado_por IS NOT NULL THEN
                     CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                    THEN 0.15
                          WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                  THEN 0.25
                          WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.75
                          ELSE 0.25 END
                   WHEN i.venta_parcial = true THEN 0.35
                   ELSE 0.75 END
            WHEN 'LENTITUD' THEN
              CASE WHEN i.cont_activado_por IS NOT NULL THEN
                     CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                    THEN 0.10
                          WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                  THEN 0.20
                          WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.30
                          ELSE 0.20 END
                   WHEN i.venta_parcial = true THEN 0.25
                   ELSE 0.30 END
            WHEN 'POS' THEN
              CASE WHEN i.cont_activado_por IS NOT NULL THEN
                     CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                    THEN 0.10
                          WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                  THEN 0.20
                          WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.40
                          ELSE 0.20 END
                   ELSE 0.40 END
            ELSE 0.30 END
      ))::int                                                                        AS iei_total_soles
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT MIN(hora_envio_correo) AS hora_envio, MIN(hora_respuesta) AS hora_resp
      FROM escalamientos WHERE incidente_id = i.id AND nivel = 1
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT MAX(nivel)::int AS nivel_max FROM escalamientos WHERE incidente_id = i.id
    ) esc_max ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
    GROUP BY COALESCE(pi.nombre, pt.nombre)
    ORDER BY iei_total_soles DESC NULLS LAST
  `) as unknown as any[]

  const data = (rows as any[]).map((r) => ({
    proveedor:              r.proveedor,
    total_incidentes:       r.total_incidentes,
    resueltos:              r.resueltos,
    activos:                r.activos,
    mttr_promedio_min:      r.mttr_promedio_min,
    sla_resolucion_pct:     r.sla_resolucion_pct,
    sla_respuesta_pct:      r.sla_respuesta_pct,
    t_respuesta_prom_min:   r.t_respuesta_prom_min,
    incidentes_escalados_n2: r.incidentes_escalados_n2,
    incidentes_escalados_n3: r.incidentes_escalados_n3,
    tiendas_afectadas:      r.tiendas_afectadas,
    iei_total_soles:        r.iei_total_soles,
  }))

  return NextResponse.json({
    data,
    meta: {
      total:       data.length,
      desde:       desde.slice(0, 10),
      hasta:       hasta.slice(0, 10),
      generado_en: new Date().toISOString(),
    },
  })
}
