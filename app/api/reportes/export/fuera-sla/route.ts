import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { pgErrMsg } from '@/lib/report-sql'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}
function row(...cols: unknown[]) { return cols.map(esc).join(',') }

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desdeParam = searchParams.get('desde')
    const hastaParam = searchParams.get('hasta')

    const hasta = hastaParam ? new Date(hastaParam + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
    const desde = desdeParam ? new Date(desdeParam + 'T00:00:00-05:00').toISOString() : (() => {
      const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString()
    })()

    // Trae TODOS los evaluables: tanto los que fallaron SLA respuesta como SLA resolución
    const rows = await db.execute(sql`
      SELECT
        i.codigo,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'DD/MM/YYYY')       AS fecha,
        t.codigo                                                                   AS tienda_codigo,
        t.nombre_cc                                                                AS tienda_nombre_cc,
        t.distrito,
        COALESCE(pi.nombre, pt.nombre)                                             AS proveedor,
        i.tipo                                                                     AS tipo_incidente,
        i.estado,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'HH24:MI')           AS hora_inicio,
        TO_CHAR(i.hora_fin      AT TIME ZONE 'America/Lima', 'HH24:MI')           AS hora_resolucion,
        i.mttr_minutos                                                             AS mttr_min,

        -- T. resolución proveedor (hora_fin − hora_primera_resp): reloj SLA real
        ROUND(EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60)::int AS t_resolucion_min,

        -- Límites SLA según contrato vigente (con fallback default)
        COALESCE(cp.tiempo_resolucion_sla, 90)                                     AS limite_resolucion_min,
        COALESCE(cp.tiempo_respuesta_sla,  60)                                     AS limite_respuesta_min,

        -- Exceso resolución (hora_fin − hora_primera_resp − límite)
        ROUND(EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60)::int
          - COALESCE(cp.tiempo_resolucion_sla, 90)                                 AS exceso_resolucion_min,

        -- SLA Respuesta: tiempo desde primer correo hasta primera respuesta del proveedor
        ROUND(EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60)::int AS t_respuesta_min,
        ROUND(EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60)::int
          - COALESCE(cp.tiempo_respuesta_sla, 60)                                  AS exceso_respuesta_min,

        -- Tipo de falla
        CASE
          WHEN i.estado != 'RESUELTO' OR i.hora_fin IS NULL THEN 'SLA Pendiente'
          WHEN n1.hora_envio_raw IS NULL THEN 'Sin escalamiento N1'
          WHEN resp.hora_primera_resp IS NULL
            AND i.mttr_minutos > COALESCE(cp.tiempo_resolucion_sla, 90)
            THEN 'Sin respuesta N1 + Resolución tardía'
          WHEN resp.hora_primera_resp IS NULL THEN 'Sin respuesta N1'
          WHEN EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60
               > COALESCE(cp.tiempo_respuesta_sla, 60)
            AND EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
               > COALESCE(cp.tiempo_resolucion_sla, 90)
            THEN 'Respuesta tardía + Resolución tardía'
          WHEN EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60
               > COALESCE(cp.tiempo_respuesta_sla, 60)
            THEN 'Respuesta N1 tardía'
          ELSE 'Resolución tardía'
        END                                                                        AS tipo_falla,

        -- SLA Respuesta cumplido
        CASE
          WHEN n1.hora_envio_raw IS NULL OR resp.hora_primera_resp IS NULL THEN 'No aplica'
          WHEN EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60
            <= COALESCE(cp.tiempo_respuesta_sla, 60) THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                        AS sla_respuesta,

        -- SLA Resolución cumplido (hora_fin − hora_primera_resp vs límite contrato)
        CASE
          WHEN i.estado != 'RESUELTO' OR i.hora_fin IS NULL
            OR resp.hora_primera_resp IS NULL THEN 'Pendiente'
          WHEN EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
            <= COALESCE(cp.tiempo_resolucion_sla, 90) THEN 'Cumplido'
          ELSE 'Incumplido'
        END                                                                        AS sla_resolucion,

        -- Reabertura
        CASE WHEN i.motivo_reabertura IS NOT NULL THEN 'Sí' ELSE 'No' END         AS reabierto,
        CASE
          WHEN i.motivo_reabertura = 'TIENDA_SIN_INTERNET' THEN 'Tienda sin internet (proveedor)'
          WHEN i.motivo_reabertura = 'ERROR_AGENTE'        THEN 'Error de gestión de agente'
          ELSE ''
        END                                                                        AS motivo_reabertura,
        i.tiempo_acumulado_min                                                     AS mttr_acumulado_min

      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      LEFT JOIN LATERAL (
        SELECT MIN(e.hora_envio_correo) AS hora_envio_raw
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT MIN(e.hora_respuesta) AS hora_primera_resp
        FROM escalamientos e
        WHERE e.incidente_id = i.id
          AND e.hora_respuesta IS NOT NULL
          AND e.no_hubo_respuesta IS NOT TRUE
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
        FROM fichas
        WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT 1
      ) cp ON true
      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        AND i.estado != 'CANCELADO'
        AND i.evaluable_proveedor IS NOT FALSE
        AND i.tipo != 'CORTE_ELECTRICO'
        AND (
          -- SLA Resolución incumplida (tiempo proveedor: hora_fin − hora_primera_resp)
          (i.estado = 'RESUELTO' AND resp.hora_primera_resp IS NOT NULL AND i.hora_fin IS NOT NULL
            AND EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
              > COALESCE(cp.tiempo_resolucion_sla, 90))
          OR
          -- SLA Respuesta incumplida (respondió pero tarde)
          (n1.hora_envio_raw IS NOT NULL AND resp.hora_primera_resp IS NOT NULL
            AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1.hora_envio_raw)) / 60
              > COALESCE(cp.tiempo_respuesta_sla, 60))
          OR
          -- No hubo respuesta del proveedor en incidente resuelto
          (i.estado = 'RESUELTO' AND n1.hora_envio_raw IS NOT NULL AND resp.hora_primera_resp IS NULL)
        )
      ORDER BY i.hora_registro DESC
    `)

    const CRLF = '\r\n'
    const headers = row(
      'Código', 'Fecha', 'Código Tienda', 'Nombre CC', 'Distrito', 'Proveedor',
      'Tipo incidente', 'Estado', 'Hora inicio', 'Hora resolución',
      'MTTR (min)', 'T. resolución prov (min)', 'Límite resolución (min)', 'Exceso resolución (min)',
      'T. respuesta N1 (min)', 'Límite respuesta (min)', 'Exceso respuesta (min)',
      'SLA Respuesta', 'SLA Resolución', 'Tipo de falla',
      'Reabierto', 'Motivo reabertura', 'MTTR acumulado (min)'
    )
    const dataRows = (rows as any[]).map(r =>
      row(
        r.codigo, r.fecha, r.tienda_codigo, r.tienda_nombre_cc ?? '', r.distrito ?? '',
        r.proveedor ?? '', r.tipo_incidente, r.estado,
        r.hora_inicio, r.hora_resolucion ?? '',
        r.mttr_min ?? '', r.t_resolucion_min ?? '', r.limite_resolucion_min, r.exceso_resolucion_min ?? '',
        r.t_respuesta_min ?? '', r.limite_respuesta_min,
        r.exceso_respuesta_min != null && r.exceso_respuesta_min > 0 ? r.exceso_respuesta_min : '',
        r.sla_respuesta, r.sla_resolucion, r.tipo_falla,
        r.reabierto, r.motivo_reabertura ?? '', r.mttr_acumulado_min ?? ''
      )
    )

    const csv = '﻿' + [headers, ...dataRows].join(CRLF)
    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_fuera_sla_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: unknown) {
    console.error('[export/fuera-sla]', (err as any)?.cause ?? err)
    return NextResponse.json({ error: pgErrMsg(err) }, { status: 500 })
  }
}
