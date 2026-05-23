import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}
function row(...cols: unknown[]) { return cols.map(esc).join(',') }
function fmtFecha(iso: string) {
  const d = new Date(iso)
  const lima = new Date(d.getTime() - 5 * 3600000)
  return `${String(lima.getUTCDate()).padStart(2,'0')}/${String(lima.getUTCMonth()+1).padStart(2,'0')}/${lima.getUTCFullYear()}`
}
function fmtMin(min: number | null) {
  if (!min) return ''
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desdeParam     = searchParams.get('desde')
    const hastaParam     = searchParams.get('hasta')
    const proveedorFiltro = searchParams.get('proveedor') || null

    const hasta  = hastaParam  ? new Date(hastaParam  + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
    const desde  = desdeParam  ? new Date(desdeParam  + 'T00:00:00-05:00').toISOString() : (() => {
      const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString()
    })()
    const durMs   = new Date(hasta).getTime() - new Date(desde).getTime()
    const desdeAnt = new Date(new Date(desde).getTime() - durMs).toISOString()

    const provFilter = proveedorFiltro
      ? sql`AND COALESCE(pi.nombre, pt.nombre) ILIKE ${proveedorFiltro}`
      : sql``

    const [tot, totAnt, porProv, top15, porTipo] = await Promise.all([
      // Totales período actual
      db.execute(sql`
        SELECT COUNT(i.id)::int AS total,
          ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD' THEN 240   WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
          COUNT(DISTINCT i.tienda_id)::int AS tiendas,
          ROUND(SUM(COALESCE(t.venta_hora_soles,
              CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
                WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
            * (COALESCE(i.mttr_minutos,0)::numeric/60) * 0.35
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL' THEN
                  CASE WHEN i.boleta_manual = true THEN 0.40
                       WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.30
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 1.00
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.50
                       ELSE 1.00 END
                WHEN 'INTERMITENCIA' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.15
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.25
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.75
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.35
                       ELSE 0.75 END
                WHEN 'LENTITUD' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.30
                              ELSE 0.20 END
                       WHEN i.venta_parcial = true THEN 0.25
                       ELSE 0.30 END
                WHEN 'POS' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.40
                              ELSE 0.20 END
                       ELSE 0.40 END
                ELSE 0.30 END
          ))::int AS iei_total
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        ${provFilter}
      `),
      // Totales período anterior
      db.execute(sql`
        SELECT COUNT(i.id)::int AS total,
          ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD' THEN 240   WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
          COUNT(DISTINCT i.tienda_id)::int AS tiendas,
          ROUND(SUM(COALESCE(t.venta_hora_soles,
              CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
                WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
            * (COALESCE(i.mttr_minutos,0)::numeric/60) * 0.35
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL' THEN
                  CASE WHEN i.boleta_manual = true THEN 0.40
                       WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.30
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 1.00
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.50
                       ELSE 1.00 END
                WHEN 'INTERMITENCIA' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.15
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.25
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.75
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.35
                       ELSE 0.75 END
                WHEN 'LENTITUD' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.30
                              ELSE 0.20 END
                       WHEN i.venta_parcial = true THEN 0.25
                       ELSE 0.30 END
                WHEN 'POS' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.40
                              ELSE 0.20 END
                       ELSE 0.40 END
                ELSE 0.30 END
          ))::int AS iei_total
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desdeAnt}::timestamptz AND i.hora_registro < ${desde}::timestamptz
          AND i.estado != 'CANCELADO'
        ${provFilter}
      `),
      // Por proveedor
      db.execute(sql`
        SELECT COALESCE(pi.nombre, pt.nombre) AS proveedor,
          COUNT(i.id)::int AS incidentes,
          ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD' THEN 240   WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
          COUNT(DISTINCT i.tienda_id)::int AS tiendas_afectadas,
          ROUND(SUM(COALESCE(t.venta_hora_soles,
              CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
                WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
            * (COALESCE(i.mttr_minutos,0)::numeric/60) * 0.35
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL' THEN
                  CASE WHEN i.boleta_manual = true THEN 0.40
                       WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.30
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 1.00
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.50
                       ELSE 1.00 END
                WHEN 'INTERMITENCIA' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.15
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.25
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.75
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.35
                       ELSE 0.75 END
                WHEN 'LENTITUD' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.30
                              ELSE 0.20 END
                       WHEN i.venta_parcial = true THEN 0.25
                       ELSE 0.30 END
                WHEN 'POS' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.40
                              ELSE 0.20 END
                       ELSE 0.40 END
                ELSE 0.30 END
          ))::int AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        ${provFilter}
        GROUP BY COALESCE(pi.nombre, pt.nombre)
        ORDER BY iei DESC NULLS LAST
      `),
      // Top 15 tiendas
      db.execute(sql`
        SELECT t.codigo, t.nombre_cc, t.distrito,
          COALESCE(pi.nombre, pt.nombre) AS proveedor,
          COUNT(i.id)::int AS incidentes,
          ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
          ROUND(SUM(COALESCE(t.venta_hora_soles,
              CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
                WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
            * (COALESCE(i.mttr_minutos,0)::numeric/60) * 0.35
            * CASE i.tipo
                WHEN 'CAIDA_TOTAL' THEN
                  CASE WHEN i.boleta_manual = true THEN 0.40
                       WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.30
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 1.00
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.50
                       ELSE 1.00 END
                WHEN 'INTERMITENCIA' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.15
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.25
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.75
                              ELSE 0.25 END
                       WHEN i.venta_parcial = true THEN 0.35
                       ELSE 0.75 END
                WHEN 'LENTITUD' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.30
                              ELSE 0.20 END
                       WHEN i.venta_parcial = true THEN 0.25
                       ELSE 0.30 END
                WHEN 'POS' THEN
                  CASE WHEN i.cont_activado_por IS NOT NULL THEN
                         CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')                          THEN 0.10
                              WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')                        THEN 0.20
                              WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA')       THEN 0.40
                              ELSE 0.20 END
                       ELSE 0.40 END
                ELSE 0.30 END
          ))::int AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        ${provFilter}
        GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
        ORDER BY incidentes DESC LIMIT 15
      `),
      // Por tipo
      db.execute(sql`
        SELECT i.tipo, COUNT(i.id)::int AS total,
          ROUND(AVG(i.mttr_minutos))::int AS mttr_avg
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        ${provFilter}
        GROUP BY i.tipo ORDER BY total DESC
      `),
    ])

    const t0  = (tot    as any[])[0] ?? {}
    const t1  = (totAnt as any[])[0] ?? {}
    const provs = porProv  as any[]
    const tiendas15 = top15 as any[]
    const tipos = porTipo  as any[]
    const totalTipos = tipos.reduce((s: number, r: any) => s + Number(r.total), 0)

    function varPct(curr: number, prev: number) {
      if (!prev) return ''
      const d = Math.round((curr - prev) / prev * 100)
      return d >= 0 ? `+${d}%` : `${d}%`
    }
    function varAbs(curr: number, prev: number) {
      const d = curr - prev
      return d >= 0 ? `+${d}` : `${d}`
    }

    const lines: string[] = ['﻿']
    const CRLF = '\r\n'
    const addRow  = (...cols: unknown[]) => { lines.push(row(...cols)) }
    const addBlank = () => { lines.push('') }

    // Sección 1 — Encabezado
    addRow('REPORTE GERENCIAL — NETDESK FOOTLOOSE PERÚ')
    addRow('Período:', `${fmtFecha(desde)} al ${fmtFecha(hasta)}`)
    addBlank()

    // Sección 2 — Resumen ejecutivo
    addRow('RESUMEN EJECUTIVO')
    addRow('Métrica', 'Valor', 'Período anterior', 'Variación')
    addRow('Total incidentes',       t0.total ?? 0,  t1.total ?? 0,  varPct(Number(t0.total), Number(t1.total)))
    addRow('MTTR promedio',          fmtMin(Number(t0.mttr_avg)), fmtMin(Number(t1.mttr_avg)), varAbs(Number(t0.mttr_avg), Number(t1.mttr_avg)) + ' min')
    addRow('Cumplimiento SLA',       `${t0.sla_pct ?? 0}%`, `${t1.sla_pct ?? 0}%`, varAbs(Number(t0.sla_pct), Number(t1.sla_pct)) + ' pp')
    addRow('Tiendas afectadas',      `${t0.tiendas ?? 0} de 156`, `${t1.tiendas ?? 0} de 156`, '—')
    addRow('Impacto económico est.', `S/ ${(t0.iei_total ?? 0).toLocaleString()}`, `S/ ${(t1.iei_total ?? 0).toLocaleString()}`, varPct(Number(t0.iei_total), Number(t1.iei_total)))
    addBlank()

    // Sección 3 — Por proveedor
    addRow('MÉTRICAS POR PROVEEDOR')
    addRow('Proveedor', 'Incidentes', 'MTTR prom (min)', 'SLA %', 'Tiendas afectadas', 'IEI est (S/)')
    for (const p of provs) addRow(p.proveedor, p.incidentes, p.mttr_avg ?? '', p.sla_pct ?? '', p.tiendas_afectadas, p.iei ?? 0)
    addBlank()

    // Sección 4 — Top 15 tiendas
    addRow('TOP 15 TIENDAS MÁS AFECTADAS')
    addRow('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Incidentes', 'MTTR prom (min)', 'IEI est (S/)')
    tiendas15.forEach((t, idx) => addRow(idx + 1, t.codigo, t.nombre_cc ?? '', t.distrito ?? '', t.proveedor ?? '', t.incidentes, t.mttr_avg ?? '', t.iei ?? 0))
    addBlank()

    // Sección 5 — Por tipo
    addRow('DISTRIBUCIÓN POR TIPO DE INCIDENTE')
    addRow('Tipo', 'Total', '% del total', 'MTTR prom (min)')
    for (const t of tipos) {
      const pct = totalTipos > 0 ? Math.round(Number(t.total) / totalTipos * 100) : 0
      addRow(t.tipo, t.total, `${pct}%`, t.mttr_avg ?? '')
    }

    const csv = lines.join(CRLF)
    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_gerencial_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('[export/gerencial]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
