import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { ieiSum, pgErrMsg } from '@/lib/report-sql'

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

    const [resumen, detalle] = await Promise.all([
      // Sección 1 — Resumen por proveedor
      db.execute(sql`
        SELECT
          COALESCE(pi.nombre, pt.nombre)                                         AS proveedor,
          COUNT(i.id)::int                                                        AS total,
          COUNT(i.id) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO')::int AS evaluables_sla,
          ROUND(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL
            AND resp.hora_primera_resp IS NOT NULL
            AND i.hora_fin IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO'
            AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60
              <= COALESCE(cp.tiempo_respuesta_sla, 60)
            AND EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
              <= COALESCE(cp.tiempo_resolucion_sla, 90)
          ) * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO'), 0))::int AS sla_pct,
          ROUND(AVG(i.mttr_minutos))::int                                        AS mttr_avg,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60
          ))::int                                                                 AS t_resp_avg,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
          ) FILTER (WHERE i.estado = 'RESUELTO'
            AND resp.hora_primera_resp IS NOT NULL AND i.hora_fin IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO'))::int AS t_resol_avg,
          COUNT(DISTINCT e2.incidente_id)::int                                   AS escalados_n2,
          COUNT(DISTINCT i.tienda_id)::int                                       AS tiendas_afectadas,
          COUNT(*) FILTER (WHERE i.motivo_reabertura IS NOT NULL)::int           AS reaperturas,
          ROUND(COUNT(*) FILTER (WHERE i.motivo_reabertura IS NOT NULL) * 100.0 /
            NULLIF(COUNT(i.id), 0), 1)                                           AS tasa_reapertura,
          MODE() WITHIN GROUP (ORDER BY i.motivo_reabertura)
            FILTER (WHERE i.motivo_reabertura IS NOT NULL)                       AS motivo_frecuente,
          ${sql.raw(ieiSum())}                                                    AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        LEFT JOIN LATERAL (
          SELECT MIN(hora_envio_correo) AS hora_correo_n1_val
          FROM escalamientos e
          WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
        ) n1h ON true
        LEFT JOIN LATERAL (
          SELECT MIN(hora_respuesta) AS hora_primera_resp
          FROM escalamientos e
          WHERE e.incidente_id = i.id AND e.hora_respuesta IS NOT NULL AND e.no_hubo_respuesta IS NOT TRUE
        ) resp ON true
        LEFT JOIN LATERAL (
          SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
          FROM fichas
          WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
          LIMIT 1
        ) cp ON true
        LEFT JOIN LATERAL (
          SELECT DISTINCT incidente_id
          FROM escalamientos e
          WHERE e.incidente_id = i.id AND e.nivel >= 2
          LIMIT 1
        ) e2 ON true
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY COALESCE(pi.nombre, pt.nombre)
        ORDER BY iei DESC NULLS LAST
      `),
      // Sección 2 — Detalle por tienda
      db.execute(sql`
        SELECT
          COALESCE(pi.nombre, pt.nombre)                     AS proveedor,
          t.codigo                                           AS tienda_codigo,
          t.nombre_cc                                        AS tienda_nombre_cc,
          t.distrito,
          COUNT(i.id)::int                                   AS incidentes,
          MODE() WITHIN GROUP (ORDER BY i.tipo)              AS tipo_frecuente,
          ROUND(AVG(i.mttr_minutos))::int                    AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL
            AND resp.hora_primera_resp IS NOT NULL
            AND i.hora_fin IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO'
            AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60
              <= COALESCE(cp.tiempo_respuesta_sla, 60)
            AND EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60
              <= COALESCE(cp.tiempo_resolucion_sla, 90)
          ) * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE AND i.tipo != 'CORTE_ELECTRICO'), 0))::int AS sla_pct,
          COUNT(*) FILTER (WHERE i.motivo_reabertura IS NOT NULL)::int           AS reaperturas,
          ${sql.raw(ieiSum())}                                                    AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        LEFT JOIN LATERAL (
          SELECT MIN(hora_envio_correo) AS hora_correo_n1_val
          FROM escalamientos e
          WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
        ) n1h ON true
        LEFT JOIN LATERAL (
          SELECT MIN(hora_respuesta) AS hora_primera_resp
          FROM escalamientos e
          WHERE e.incidente_id = i.id AND e.hora_respuesta IS NOT NULL AND e.no_hubo_respuesta IS NOT TRUE
        ) resp ON true
        LEFT JOIN LATERAL (
          SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
          FROM fichas
          WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
          LIMIT 1
        ) cp ON true
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY COALESCE(pi.nombre, pt.nombre), t.id, t.codigo, t.nombre_cc, t.distrito
        ORDER BY COALESCE(pi.nombre, pt.nombre), incidentes DESC
      `),
    ])

    const lines: string[] = ['﻿']
    const CRLF = '\r\n'
    const add = (...cols: unknown[]) => lines.push(row(...cols))

    add('EVALUACIÓN DE PROVEEDORES — NETDESK')
    add('Proveedor', 'Total incidentes', 'Evaluables SLA', 'SLA %', 'MTTR prom (min)',
      'T. respuesta prom (min)', 'T. resolución prom (min)', 'Escalados N2+', 'Tiendas afectadas',
      'Reaperturas', 'Tasa reapertura (%)', 'Motivo frecuente reabertura', 'IEI est (S/)')
    for (const r of (resumen as any[])) {
      const motivoLabel = r.motivo_frecuente === 'TIENDA_SIN_INTERNET' ? 'Tienda sin internet (proveedor)'
        : r.motivo_frecuente === 'ERROR_AGENTE' ? 'Error de gestión de agente'
        : ''
      add(r.proveedor, r.total, r.evaluables_sla ?? '', r.sla_pct ?? '', r.mttr_avg ?? '',
        r.t_resp_avg ?? '', r.t_resol_avg ?? '', r.escalados_n2 ?? 0, r.tiendas_afectadas,
        r.reaperturas ?? 0, r.tasa_reapertura != null ? `${r.tasa_reapertura}%` : '0%',
        motivoLabel, r.iei ?? 0)
    }

    lines.push('')
    add('DETALLE POR TIENDA')
    add('Proveedor', 'Código tienda', 'Nombre CC', 'Distrito', 'Incidentes',
      'Tipo más frecuente', 'MTTR prom (min)', 'SLA %', 'Reaperturas', 'IEI est (S/)')
    for (const r of (detalle as any[]))
      add(r.proveedor, r.tienda_codigo, r.tienda_nombre_cc ?? '', r.distrito ?? '',
        r.incidentes, r.tipo_frecuente ?? '', r.mttr_avg ?? '', r.sla_pct ?? '',
        r.reaperturas ?? 0, r.iei ?? 0)

    const csv = lines.join(CRLF)
    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_proveedores_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: unknown) {
    console.error('[export/proveedores]', (err as any)?.cause ?? err)
    return NextResponse.json({ error: pgErrMsg(err) }, { status: 500 })
  }
}
