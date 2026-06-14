import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { calcImpactoRow } from '@/lib/impacto-calc'
import { pgErrMsg } from '@/lib/report-sql'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desdeParam = searchParams.get('desde')
    const hastaParam = searchParams.get('hasta')
    const estado     = searchParams.get('estado') ?? ''

    // Fechas en zona Lima (-05:00): incluye el día completo hasta 23:59:59 — ver CLAUDE.md
    const hasta = hastaParam ? new Date(hastaParam + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
    const desde = desdeParam ? new Date(desdeParam + 'T00:00:00-05:00').toISOString() : (() => {
      const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString()
    })()

    const rows = await db.execute(sql`
      SELECT
        i.codigo,
        i.ticket_invgate,
        i.ticket_proveedor,
        t.codigo                                                                       AS tienda_codigo,
        t.nombre_cc                                                                    AS tienda_nombre_cc,
        COALESCE(t.distrito, '')                                                       AS ubicacion,
        COALESCE(pi.nombre, pt.nombre)                                                 AS proveedor,
        f.cid_servicio,
        f.tipo_conexion,
        t.cluster,
        i.nivel_impacto,
        i.tipo                                                                         AS tipo_incidente,
        i.usuarios_afectados,
        esc_max.nivel_max                                                              AS nivel_escalado,
        i.tipo_operacion_manual                                                        AS factor_operativo,
        CASE WHEN COALESCE(t.tiene_contingencia, false) THEN 'Sí' ELSE 'No' END      AS tiene_contingencia,
        CASE
          WHEN i.boleta_manual = true                          THEN 'Boleta Manual'
          WHEN i.cont_activado_por IS NOT NULL AND i.cont_es_externo = true THEN 'Router Externo'
          WHEN i.cont_activado_por IS NOT NULL                 THEN 'Router Propio'
          WHEN i.mov_activado_por  IS NOT NULL                 THEN 'Datos Móviles'
          ELSE ''
        END                                                                           AS tipo_contingencia,
        CASE
          WHEN i.boleta_manual = true     THEN COALESCE(i.boleta_rendimiento, '')
          WHEN i.cont_activado_por IS NOT NULL THEN COALESCE(i.cont_rendimiento, '')
          WHEN i.mov_activado_por  IS NOT NULL THEN COALESCE(i.mov_rendimiento, '')
          ELSE ''
        END                                                                           AS contingencia_rendimiento,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'DD/MM/YYYY')             AS fecha,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'HH24:MI')               AS hora_inicio,
        CASE
          WHEN i.mttr_minutos IS NULL THEN ''
          WHEN i.mttr_minutos < 60    THEN i.mttr_minutos::text || 'm'
          ELSE FLOOR(i.mttr_minutos / 60)::text || 'h ' || (i.mttr_minutos % 60)::text || 'm'
        END                                                                            AS tiempo_total_mttr,
        n1.enviado                                                                     AS enviado_n1,
        n1.respuesta                                                                   AS respuesta_n1,
        n2.enviado                                                                     AS enviado_n2,
        n2.respuesta                                                                   AS respuesta_n2,
        n3.enviado                                                                     AS enviado_n3,
        n3.respuesta                                                                   AS respuesta_n3,
        TO_CHAR(i.hora_fin AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY')         AS hora_solucion,
        i.observaciones                                                                AS comentarios,
        CASE
          WHEN COALESCE(i.cont_rendimiento, i.mov_rendimiento) IN ('TOTAL','EFECTIVA')              THEN 'Total'
          WHEN COALESCE(i.cont_rendimiento, i.mov_rendimiento) IN ('PARCIAL','LIMITADA')            THEN 'Parcial'
          WHEN COALESCE(i.cont_rendimiento, i.mov_rendimiento) IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 'Fallida'
          ELSE COALESCE(i.cont_rendimiento, i.mov_rendimiento)
        END                                                                            AS efectividad_contingencia,
        i.mttr_minutos                                                                 AS mttr_min,

        -- SLA Respuesta: primer correo (cualquier nivel) hasta primera respuesta del proveedor
        CASE
          WHEN sla_n1.hora_correo_n1 IS NULL OR sla_resp.hora_primera_resp IS NULL
            THEN 'No escalado'
          WHEN EXTRACT(EPOCH FROM (sla_resp.hora_primera_resp - sla_n1.hora_correo_n1)) / 60
            <= COALESCE(sla_cp.tiempo_respuesta_sla, 60)
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_respuesta,

        -- SLA Resolución: hora_fin − hora_primera_resp vs límite contrato
        CASE
          WHEN i.estado != 'RESUELTO' OR i.hora_fin IS NULL OR sla_resp.hora_primera_resp IS NULL
            THEN 'No aplica'
          WHEN EXTRACT(EPOCH FROM (i.hora_fin - sla_resp.hora_primera_resp)) / 60
            <= COALESCE(sla_cp.tiempo_resolucion_sla, 90)
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_resolucion,

        -- SLA Cumplido: respuesta Y resolución dentro del límite del contrato
        CASE
          WHEN i.evaluable_proveedor = false
            THEN 'No evaluable'
          WHEN i.estado != 'RESUELTO' OR i.hora_fin IS NULL
            THEN 'Pendiente'
          WHEN sla_n1.hora_correo_n1 IS NOT NULL
            AND sla_resp.hora_primera_resp IS NOT NULL
            AND EXTRACT(EPOCH FROM (sla_resp.hora_primera_resp - sla_n1.hora_correo_n1)) / 60
              <= COALESCE(sla_cp.tiempo_respuesta_sla, 60)
            AND EXTRACT(EPOCH FROM (i.hora_fin - sla_resp.hora_primera_resp)) / 60
              <= COALESCE(sla_cp.tiempo_resolucion_sla, 90)
            THEN 'Sí'
          ELSE 'No'
        END                                                                            AS sla_cumplido,

        t.venta_hora_soles                                                             AS venta_hora_tienda,
        i.resuelto_por,
        i.atribucion_final,
        -- Raw fields for IEI calculation (calcImpactoRow con timestamps)
        i.hora_registro                                                                AS hora_reg_raw,
        i.hora_fin                                                                     AS hora_fin_raw,
        COALESCE(i.iei_acumulado, 0)                                                   AS iei_acumulado_raw,
        i.estado                                                                       AS estado_raw,
        (i.cont_activado_por IS NOT NULL)                                              AS contingencia_activa_inc,
        COALESCE(i.cont_es_externo, false)                                             AS cont_es_externo,
        i.cont_hora_activacion                                                         AS cont_hora_activacion_raw,
        i.cont_hora_desactivacion                                                      AS cont_hora_desactivacion_raw,
        i.cont_rendimiento                                                             AS cont_rendimiento_raw,
        i.mov_hora_activacion                                                          AS mov_hora_activacion_raw,
        i.mov_hora_desactivacion                                                       AS mov_hora_desactivacion_raw,
        i.mov_rendimiento                                                              AS mov_rendimiento_raw,
        (i.mov_activado_por IS NOT NULL)                                               AS hubo_movil,
        i.boleta_manual,
        i.boleta_rendimiento                                                           AS boleta_rendimiento_raw,
        i.boleta_hora_activacion                                                       AS boleta_hora_activacion_raw,
        t.venta_hora_fds_soles,
        i.venta_parcial,
        i.cajas_afectadas,
        i.cajas_totales

      FROM incidentes i
      JOIN    tiendas      t   ON i.tienda_id         = t.id
      LEFT JOIN fichas      f   ON f.id = COALESCE(i.ficha_id, t.ficha_activa_id)
      LEFT JOIN proveedores  pi  ON i.proveedor_id    = pi.id
      LEFT JOIN proveedores  pt  ON t.proveedor_id    = pt.id
      LEFT JOIN usuarios     u   ON i.registrado_por_id = u.id

      -- Nivel máximo de escalamiento alcanzado
      LEFT JOIN LATERAL (
        SELECT MAX(e.nivel) AS nivel_max
        FROM escalamientos e
        WHERE e.incidente_id = i.id
      ) esc_max ON true

      -- Escalamiento N1
      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta,
          MIN(e.hora_envio_correo)                                                              AS hora_envio_raw,
          MIN(e.hora_respuesta)                                                                 AS hora_respuesta_raw
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 1
      ) n1 ON true

      -- Escalamiento N2
      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 2
      ) n2 ON true

      -- Escalamiento N3
      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR(MIN(e.hora_envio_correo) AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS enviado,
          TO_CHAR(MIN(e.hora_respuesta)    AT TIME ZONE 'America/Lima', 'HH24:MI DD/MM/YYYY') AS respuesta
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 3
      ) n3 ON true

      -- Primer correo de cualquier nivel + primera respuesta (reloj SLA real)
      LEFT JOIN LATERAL (
        SELECT MIN(e.hora_envio_correo) AS hora_correo_n1
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
      ) sla_n1 ON true
      LEFT JOIN LATERAL (
        SELECT MIN(e.hora_respuesta) AS hora_primera_resp
        FROM escalamientos e
        WHERE e.incidente_id = i.id
          AND e.hora_respuesta IS NOT NULL
          AND e.no_hubo_respuesta IS NOT TRUE
      ) sla_resp ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
        FROM fichas
        WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT 1
      ) sla_cp ON true

      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        ${estado ? sql`AND i.estado = ${estado}` : sql``}
      ORDER BY i.hora_registro DESC
    `)

    const headers = [
      'Código', 'Ticket InvGate', 'Ticket Proveedor', 'Código Tienda', 'Nombre CC', 'Ubicación',
      'Proveedor', 'CID', 'Tipo Conexión', 'Cluster', 'Nivel Impacto',
      'Tipo Incidente', 'Usuarios Afectados', 'Nivel Escalado', 'Factor Operativo',
      'Tiene Contingencia', 'Tipo Contingencia', 'Rendimiento Contingencia',
      'Fecha', 'Hora Inicio', 'Tiempo Total (MTTR)',
      'Enviado N1', 'Respuesta N1', 'Enviado N2', 'Respuesta N2',
      'Enviado N3', 'Respuesta N3', 'Hora Solución', 'Comentarios',
      'MTTR (min)', 'SLA Respuesta', 'SLA Resolución', 'SLA Cumplido',
      'IEI (S/)', 'Venta/Hora Tienda', 'Efectividad Contingencia', 'Resuelto por', 'Atribución',
    ]

    const escape = (v: unknown) => {
      if (v == null) return ''
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const lines = [
      headers.join(','),
      ...(rows as any[]).map(r => {
        const iei = calcImpactoRow({
          hora_registro:           r.hora_reg_raw,
          hora_fin:                r.hora_fin_raw,
          estado:                  r.estado_raw,
          tipo:                    r.tipo_incidente,
          venta_hora_soles:        r.venta_hora_tienda != null ? Number(r.venta_hora_tienda) : null,
          venta_hora_fds_soles:    r.venta_hora_fds_soles != null ? Number(r.venta_hora_fds_soles) : null,
          cluster:                 r.cluster,
          cont_hora_activacion:    r.cont_hora_activacion_raw,
          cont_hora_desactivacion: r.cont_hora_desactivacion_raw,
          cont_es_externo:         Boolean(r.cont_es_externo),
          cont_rendimiento:        r.cont_rendimiento_raw,
          contingencia_activa:     Boolean(r.contingencia_activa_inc),
          mov_hora_activacion:     r.mov_hora_activacion_raw,
          mov_hora_desactivacion:  r.mov_hora_desactivacion_raw,
          mov_rendimiento:         r.mov_rendimiento_raw,
          hubo_movil:              Boolean(r.hubo_movil),
          boleta_manual:           r.boleta_manual,
          boleta_rendimiento:      r.boleta_rendimiento_raw,
          boleta_hora_activacion:  r.boleta_hora_activacion_raw,
          venta_parcial:           r.venta_parcial,
          cajas_afectadas:         r.cajas_afectadas != null ? Number(r.cajas_afectadas) : null,
          cajas_totales:           r.cajas_totales   != null ? Number(r.cajas_totales)   : null,
        }).impactoEstimado + Number(r.iei_acumulado_raw ?? 0) || null
        return [
          r.codigo, r.ticket_invgate, r.ticket_proveedor, r.tienda_codigo, r.tienda_nombre_cc, r.ubicacion,
          r.proveedor, r.cid_servicio, r.tipo_conexion, r.cluster, r.nivel_impacto,
          r.tipo_incidente, r.usuarios_afectados, r.nivel_escalado, r.factor_operativo,
          r.tiene_contingencia, r.tipo_contingencia, r.contingencia_rendimiento,
          r.fecha, r.hora_inicio, r.tiempo_total_mttr,
          r.enviado_n1, r.respuesta_n1, r.enviado_n2, r.respuesta_n2,
          r.enviado_n3, r.respuesta_n3, r.hora_solucion, r.comentarios,
          r.mttr_min, r.sla_respuesta, r.sla_resolucion, r.sla_cumplido,
          iei, r.venta_hora_tienda, r.efectividad_contingencia ?? '', r.resuelto_por ?? '', r.atribucion_final ?? '',
        ].map(escape).join(',')
      }),
    ]

    const csv = '﻿' + lines.join('\r\n') // BOM UTF-8 para Excel

    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_incidentes_operativos_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: unknown) {
    console.error('[export/operativos]', (err as any)?.cause ?? err)
    return NextResponse.json({ error: pgErrMsg(err) }, { status: 500 })
  }
}
