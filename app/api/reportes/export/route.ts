import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desde  = searchParams.get('desde') ?? new Date(Date.now() - 30 * 86400000).toISOString()
    const hasta  = searchParams.get('hasta') ?? new Date().toISOString()
    const estado = searchParams.get('estado') ?? ''

    const rows = await db.execute(sql`
      SELECT
        i.codigo,
        i.ticket_invgate,
        i.ticket_proveedor,
        t.codigo                                                                       AS tienda_codigo,
        t.nombre_cc                                                                    AS tienda_nombre_cc,
        COALESCE(t.distrito, '')                                                       AS ubicacion,
        COALESCE(pi.nombre, pt.nombre)                                                 AS proveedor,
        t.cid_servicio,
        t.tipo_conexion,
        t.cluster,
        i.nivel_impacto,
        i.tipo                                                                         AS tipo_incidente,
        i.usuarios_afectados,
        esc_max.nivel_max                                                              AS nivel_escalado,
        i.tipo_operacion_manual                                                        AS factor_operativo,
        CASE WHEN COALESCE(t.tiene_contingencia, false) THEN 'Sí' ELSE 'No' END      AS tiene_contingencia,
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
        COALESCE(i.cont_rendimiento, i.mov_rendimiento)                               AS efectividad_contingencia,
        i.mttr_minutos                                                                 AS mttr_min,

        -- SLA Respuesta: tiempo desde envío N1 hasta respuesta del proveedor (≤ 60 min)
        CASE
          WHEN n1.hora_envio_raw IS NULL OR n1.hora_respuesta_raw IS NULL
            THEN 'No escalado'
          WHEN EXTRACT(EPOCH FROM (n1.hora_respuesta_raw - n1.hora_envio_raw)) / 60 <= 60
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_respuesta,

        -- SLA Resolución: mttr vs límite por tipo de incidente
        CASE
          WHEN i.estado != 'RESUELTO' OR i.mttr_minutos IS NULL
            THEN 'No aplica'
          WHEN i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL'   THEN 60
              WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'      THEN 240
              WHEN 'POS'           THEN 60
              ELSE 120
            END
            THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                            AS sla_resolucion,

        -- SLA Cumplido: ambas partes deben cumplirse
        CASE
          WHEN i.evaluable_proveedor = false
            THEN 'No evaluable'
          WHEN i.estado != 'RESUELTO' OR i.mttr_minutos IS NULL
            THEN 'Pendiente'
          WHEN (
            n1.hora_envio_raw IS NOT NULL
            AND n1.hora_respuesta_raw IS NOT NULL
            AND EXTRACT(EPOCH FROM (n1.hora_respuesta_raw - n1.hora_envio_raw)) / 60 <= 60
            AND i.mttr_minutos <= CASE i.tipo
                WHEN 'CAIDA_TOTAL'   THEN 60
                WHEN 'INTERMITENCIA' THEN 120
                WHEN 'LENTITUD'      THEN 240
                WHEN 'POS'           THEN 60
                ELSE 120
              END
          )
            THEN 'Sí'
          ELSE 'No'
        END                                                                            AS sla_cumplido,

        -- IEI: venta/hora × horas afectadas × margen 35% × factor por tipo y contingencia
        CASE
          WHEN i.mttr_minutos IS NULL THEN NULL
          ELSE ROUND(
            COALESCE(
              t.venta_hora_soles::numeric,
              CASE t.cluster
                WHEN 'A' THEN 931
                WHEN 'B' THEN 521
                WHEN 'C' THEN 348
                WHEN 'D' THEN 197
                ELSE NULL
              END::numeric
            )
            * (i.mttr_minutos::numeric / 60)
            * 0.35
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.25 ELSE 1.00 END
                WHEN 'INTERMITENCIA'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.25 ELSE 0.75 END
                WHEN 'LENTITUD'      THEN 0.30
                WHEN 'POS'
                  THEN CASE WHEN COALESCE(t.contingencia_activa, false) THEN 0.20 ELSE 0.40 END
                ELSE 0.30
              END::numeric
          )
        END                                                                            AS iei,

        t.venta_hora_soles                                                             AS venta_hora_tienda

      FROM incidentes i
      JOIN    tiendas      t   ON i.tienda_id         = t.id
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

      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        ${estado ? sql`AND i.estado = ${estado}` : sql``}
      ORDER BY i.hora_registro DESC
    `)

    const headers = [
      'Código', 'Ticket InvGate', 'Ticket Proveedor', 'Código Tienda', 'Nombre CC', 'Ubicación',
      'Proveedor', 'CID', 'Tipo Conexión', 'Cluster', 'Nivel Impacto',
      'Tipo Incidente', 'Usuarios Afectados', 'Nivel Escalado', 'Factor Operativo',
      'Tiene Contingencia', 'Fecha', 'Hora Inicio', 'Tiempo Total (MTTR)',
      'Enviado N1', 'Respuesta N1', 'Enviado N2', 'Respuesta N2',
      'Enviado N3', 'Respuesta N3', 'Hora Solución', 'Comentarios',
      'Efectividad Contingencia', 'MTTR (min)', 'SLA Respuesta',
      'SLA Resolución', 'SLA Cumplido', 'IEI (S/)', 'Venta/Hora Tienda',
    ]

    const escape = (v: unknown) => {
      if (v == null) return ''
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const lines = [
      headers.join(','),
      ...(rows as any[]).map(r => [
        r.codigo, r.ticket_invgate, r.ticket_proveedor, r.tienda_codigo, r.tienda_nombre_cc, r.ubicacion,
        r.proveedor, r.cid_servicio, r.tipo_conexion, r.cluster, r.nivel_impacto,
        r.tipo_incidente, r.usuarios_afectados, r.nivel_escalado, r.factor_operativo,
        r.tiene_contingencia, r.fecha, r.hora_inicio, r.tiempo_total_mttr,
        r.enviado_n1, r.respuesta_n1, r.enviado_n2, r.respuesta_n2,
        r.enviado_n3, r.respuesta_n3, r.hora_solucion, r.comentarios,
        r.efectividad_contingencia, r.mttr_min, r.sla_respuesta,
        r.sla_resolucion, r.sla_cumplido, r.iei, r.venta_hora_tienda,
      ].map(escape).join(',')),
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
  } catch (err: any) {
    console.error('[export] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
