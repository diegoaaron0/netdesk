import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { apiKeyAuth, parseDateRange } from '@/lib/api-auth'
import { ieiPerRow } from '@/lib/report-sql'

export async function GET(req: NextRequest) {
  const authErr = apiKeyAuth(req)
  if (authErr) return authErr

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      TO_CHAR(i.hora_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM-DD')       AS fecha,
      TO_CHAR(i.hora_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'HH24:MI')          AS hora_inicio,
      TO_CHAR(i.hora_fin     AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'HH24:MI')           AS hora_fin,
      i.mttr_minutos,
      i.tipo,
      i.estado,
      i.nivel_impacto,
      i.usuarios_afectados,
      i.ticket_invgate,
      i.ticket_proveedor,
      -- Tienda
      t.codigo                                                                   AS tienda_codigo,
      t.nombre_cc                                                                AS tienda_nombre,
      t.distrito                                                                 AS tienda_distrito,
      t.cluster                                                                  AS tienda_cluster,
      f.tipo_conexion                                                            AS tienda_tipo_conexion,
      -- Proveedor (histórico del incidente)
      COALESCE(pi.nombre, pt.nombre)                                             AS proveedor,
      -- SLA Respuesta N1
      ROUND(EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60)::int      AS t_respuesta_n1_min,
      CASE
        WHEN n1.hora_envio IS NULL THEN 'No escalado'
        WHEN n1.hora_resp  IS NULL THEN 'Sin respuesta'
        WHEN EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60 <= COALESCE(f.tiempo_respuesta_sla, 60) THEN 'Cumplido'
        ELSE 'Incumplido'
      END                                                                        AS sla_respuesta,
      -- SLA Resolución — límite del contrato (ficha) o 90 por defecto. El tipo NO influye.
      COALESCE(f.tiempo_resolucion_sla, 90)                                      AS sla_resolucion_limite_min,
      -- Tiempo del proveedor: hora_fin − hora_primera_resp (NO el MTTR total,
      -- que también incluye la demora del agente en escalar y la del proveedor
      -- en responder — eso ya se mide aparte en sla_respuesta). Mismo patrón
      -- que fuera-sla / gerencial / tiendas-criticas / reportes/export/*.
      CASE
        WHEN i.estado != 'RESUELTO' OR i.hora_fin IS NULL OR i.mttr_minutos IS NULL THEN 'Pendiente'
        WHEN i.evaluable_proveedor = false                                          THEN 'No evaluable'
        WHEN n1.hora_resp IS NULL                                                   THEN 'Incumplido'
        WHEN EXTRACT(EPOCH FROM (i.hora_fin - n1.hora_resp)) / 60
          <= COALESCE(f.tiempo_resolucion_sla, 90)                                  THEN 'Cumplido'
        ELSE 'Incumplido'
      END                                                                        AS sla_resolucion,
      -- Nivel máximo escalado
      COALESCE(esc_max.nivel_max, 0)                                             AS nivel_escalado,
      -- Contingencia
      CASE WHEN i.cont_activado_por IS NOT NULL THEN 'Sí' ELSE 'No' END        AS tuvo_contingencia,
      i.cont_activado_por                                                        AS cont_activado_por,
      CASE
        WHEN i.cont_rendimiento = 'EFECTIVO' THEN 'Total'
        WHEN i.cont_rendimiento = 'PARCIAL'  THEN 'Parcial'
        WHEN i.cont_rendimiento = 'NULO'     THEN 'Fallida'
        ELSE i.cont_rendimiento
      END                                                                        AS cont_rendimiento,
      -- Resolución
      i.resuelto_por,
      i.atribucion_final,
      CASE WHEN i.evaluable_proveedor = false THEN 'No' ELSE 'Sí' END          AS evaluable_proveedor,
      -- IEI — misma fórmula canónica que usan los 7 endpoints de reportes
      -- (ieiPerRow de report-sql.ts). Antes se recalculaba aparte en JS con
      -- calcImpactoRow en modo booleano legado, que ni siquiera leía
      -- boleta_rendimiento ni boleta_hora_activacion.
      ROUND((${sql.raw(ieiPerRow())}))::int                                       AS iei_estimado_soles
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN fichas f ON f.id = COALESCE(i.ficha_id, t.ficha_activa_id)
    LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT MAX(nivel)::int AS nivel_max
      FROM escalamientos WHERE incidente_id = i.id
    ) esc_max ON true
    LEFT JOIN LATERAL (
      SELECT MIN(hora_envio_correo) AS hora_envio, MIN(hora_respuesta) AS hora_resp
      FROM escalamientos WHERE incidente_id = i.id
    ) n1 ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
    ORDER BY i.hora_registro DESC
  `) as unknown as any[]

  const data = rows.map((r: any) => {
    return {
      id:                      r.id,
      codigo:                  r.codigo,
      fecha:                   r.fecha,
      hora_inicio:             r.hora_inicio,
      hora_fin:                r.hora_fin,
      mttr_minutos:            r.mttr_minutos,
      tipo:                    r.tipo,
      estado:                  r.estado,
      nivel_impacto:           r.nivel_impacto,
      usuarios_afectados:      r.usuarios_afectados,
      ticket_invgate:          r.ticket_invgate,
      ticket_proveedor:        r.ticket_proveedor,
      tienda_codigo:           r.tienda_codigo,
      tienda_nombre:           r.tienda_nombre,
      tienda_distrito:         r.tienda_distrito,
      tienda_cluster:          r.tienda_cluster,
      tienda_tipo_conexion:    r.tienda_tipo_conexion,
      proveedor:               r.proveedor,
      t_respuesta_n1_min:      r.t_respuesta_n1_min,
      sla_respuesta:           r.sla_respuesta,
      sla_resolucion_limite_min: r.sla_resolucion_limite_min,
      sla_resolucion:          r.sla_resolucion,
      nivel_escalado:          r.nivel_escalado,
      tuvo_contingencia:       r.tuvo_contingencia,
      cont_activado_por:       r.cont_activado_por,
      cont_rendimiento:        r.cont_rendimiento,
      resuelto_por:            r.resuelto_por,
      atribucion_final:        r.atribucion_final,
      evaluable_proveedor:     r.evaluable_proveedor,
      iei_estimado_soles:      r.iei_estimado_soles,
    }
  })

  return NextResponse.json({
    data,
    meta: {
      total:        data.length,
      desde:        desde.slice(0, 10),
      hasta:        hasta.slice(0, 10),
      generado_en:  new Date().toISOString(),
    },
  })
}
