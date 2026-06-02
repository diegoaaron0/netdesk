import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { IEI_FACTOR, IEI_CLUSTER_FALLBACK } from '@/lib/iei-sql-expr'
import { slaLimiteCase } from '@/lib/sla-sql'

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
          COUNT(i.id) FILTER (WHERE i.estado = 'RESUELTO' AND i.mttr_minutos IS NOT NULL
            AND n1h.hora_correo_n1_val IS NOT NULL)::int                         AS evaluables_sla,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= ${slaLimiteCase('i.tipo')}
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int      AS sla_pct,
          ROUND(AVG(i.mttr_minutos))::int                                        AS mttr_avg,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60
          ))::int                                                                 AS t_resp_avg,
          COUNT(DISTINCT e2.incidente_id)::int                                   AS escalados_n2,
          COUNT(DISTINCT i.tienda_id)::int                                       AS tiendas_afectadas,
          ROUND(SUM(COALESCE(t.venta_hora_soles,${IEI_CLUSTER_FALLBACK})*(COALESCE(i.mttr_minutos,0)::numeric/60)*0.35*${IEI_FACTOR}))::int AS iei
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
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= ${slaLimiteCase('i.tipo')}
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
          ROUND(SUM(COALESCE(t.venta_hora_soles,${IEI_CLUSTER_FALLBACK})*(COALESCE(i.mttr_minutos,0)::numeric/60)*0.35*${IEI_FACTOR}))::int AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
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
      'T. respuesta prom (min)', 'Escalados N2+', 'Tiendas afectadas', 'IEI est (S/)')
    for (const r of (resumen as any[]))
      add(r.proveedor, r.total, r.evaluables_sla ?? '', r.sla_pct ?? '', r.mttr_avg ?? '',
        r.t_resp_avg ?? '', r.escalados_n2 ?? 0, r.tiendas_afectadas, r.iei ?? 0)

    lines.push('')
    add('DETALLE POR TIENDA')
    add('Proveedor', 'Código tienda', 'Nombre CC', 'Distrito', 'Incidentes',
      'Tipo más frecuente', 'MTTR prom (min)', 'SLA %', 'IEI est (S/)')
    for (const r of (detalle as any[]))
      add(r.proveedor, r.tienda_codigo, r.tienda_nombre_cc ?? '', r.distrito ?? '',
        r.incidentes, r.tipo_frecuente ?? '', r.mttr_avg ?? '', r.sla_pct ?? '', r.iei ?? 0)

    const csv = lines.join(CRLF)
    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_proveedores_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('[export/proveedores]', err)
    return NextResponse.json({ error: "Error interno al generar el reporte" }, { status: 500 })
  }
}
