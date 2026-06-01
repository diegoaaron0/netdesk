import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getTotalTiendas } from '@/lib/tiendas-stats'

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
function fmtMes(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[Number(m) - 1]} ${y}`
}

// Full IEI factor (contingencia-aware) — identical logic used across all export routes
const IEI_EXPR = sql`
  ROUND(SUM(
    COALESCE(t.venta_hora_soles,
      CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
        WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
    * (COALESCE(i.mttr_minutos,0)::numeric/60) * 0.35
    * CASE i.tipo
        WHEN 'CAIDA_TOTAL' THEN
          CASE WHEN i.boleta_manual = true THEN 0.40
               WHEN i.cont_activado_por IS NOT NULL THEN
                 CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')             THEN 0.10
                      WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')           THEN 0.30
                      WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 1.00
                      ELSE 0.25 END
               WHEN i.venta_parcial = true THEN 0.50
               ELSE 1.00 END
        WHEN 'INTERMITENCIA' THEN
          CASE WHEN i.cont_activado_por IS NOT NULL THEN
                 CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')             THEN 0.15
                      WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')           THEN 0.25
                      WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.75
                      ELSE 0.25 END
               WHEN i.venta_parcial = true THEN 0.35
               ELSE 0.75 END
        WHEN 'LENTITUD' THEN
          CASE WHEN i.cont_activado_por IS NOT NULL THEN
                 CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')             THEN 0.10
                      WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')           THEN 0.20
                      WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.30
                      ELSE 0.20 END
               WHEN i.venta_parcial = true THEN 0.25
               ELSE 0.30 END
        WHEN 'POS' THEN
          CASE WHEN i.cont_activado_por IS NOT NULL THEN
                 CASE WHEN i.cont_rendimiento IN ('TOTAL','EFECTIVA')             THEN 0.10
                      WHEN i.cont_rendimiento IN ('PARCIAL','LIMITADA')           THEN 0.20
                      WHEN i.cont_rendimiento IN ('FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 0.40
                      ELSE 0.20 END
               ELSE 0.40 END
        WHEN 'CORTE_ELECTRICO' THEN
          CASE WHEN i.boleta_manual = true AND COALESCE(i.boleta_rendimiento,'') = 'PARCIAL' THEN 0.30
               WHEN i.boleta_manual = true THEN 0.00
               ELSE 1.00 END
        ELSE 0.30 END
  ))::int
`

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desdeParam = searchParams.get('desde')
    const hastaParam = searchParams.get('hasta')

    const hasta  = hastaParam  ? new Date(hastaParam  + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
    const desde  = desdeParam  ? new Date(desdeParam  + 'T00:00:00-05:00').toISOString() : (() => {
      const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString()
    })()
    const durMs   = new Date(hasta).getTime() - new Date(desde).getTime()
    const desdeAnt = new Date(new Date(desde).getTime() - durMs).toISOString()

    const totalTiendas = await getTotalTiendas()
    const [tot, totAnt, porProv, top15, porTipo, reincidentes, porZona, slaTend] = await Promise.all([

      // ── Totales período actual ────────────────────────────────────────────────
      db.execute(sql`
        SELECT
          COUNT(i.id)::int                                                        AS total,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int  AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int      AS sla_pct,
          COUNT(DISTINCT i.tienda_id)::int                                        AS tiendas,
          ${IEI_EXPR}                                                             AS iei_total,
          COUNT(*) FILTER (WHERE i.estado = 'ABIERTO')::int                      AS abiertos,
          COUNT(*) FILTER (WHERE i.estado = 'EN_PROCESO')::int                   AS en_proceso
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
      `),

      // ── Totales período anterior ──────────────────────────────────────────────
      db.execute(sql`
        SELECT
          COUNT(i.id)::int                                                        AS total,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int  AS mttr_avg,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int      AS sla_pct,
          COUNT(DISTINCT i.tienda_id)::int                                        AS tiendas,
          ${IEI_EXPR}                                                             AS iei_total
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        WHERE i.hora_registro >= ${desdeAnt}::timestamptz AND i.hora_registro < ${desde}::timestamptz
          AND i.estado != 'CANCELADO'
      `),

      // ── Por proveedor — SLA, MTTR, T.respuesta N1, Escalados N2+, IEI ─────────
      db.execute(sql`
        SELECT
          COALESCE(pi.nombre, pt.nombre)                                         AS proveedor,
          COUNT(i.id)::int                                                        AS incidentes,
          COUNT(i.id) FILTER (WHERE i.estado = 'RESUELTO'
            AND n1h.hora_correo_n1_val IS NOT NULL)::int                         AS evaluables_sla,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int      AS sla_pct,
          -- SLA Respuesta: respondió en ≤60 min
          ROUND(COUNT(*) FILTER (
            WHERE n1h.hora_correo_n1_val IS NOT NULL
              AND resp.hora_primera_resp IS NOT NULL
              AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60 <= 60
          ) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE n1h.hora_correo_n1_val IS NOT NULL), 0))::int AS sla_respuesta_pct,
          -- SLA Resolución: resuelto dentro del límite por tipo
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO' AND n1h.hora_correo_n1_val IS NOT NULL), 0))::int AS sla_resolucion_pct,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int  AS mttr_avg,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1_val)) / 60
          ))::int                                                                 AS t_resp_prov_avg,
          COUNT(DISTINCT e2.incidente_id)::int                                   AS escalados_n2,
          COUNT(DISTINCT i.tienda_id)::int                                       AS tiendas_afectadas,
          ${IEI_EXPR}                                                             AS iei
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

      // ── Top 15 tiendas ────────────────────────────────────────────────────────
      db.execute(sql`
        SELECT t.codigo, t.nombre_cc, t.distrito,
          COALESCE(pi.nombre, pt.nombre)                                         AS proveedor,
          COUNT(i.id)::int                                                        AS incidentes,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int  AS mttr_avg,
          ${IEI_EXPR}                                                             AS iei
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
        ORDER BY incidentes DESC LIMIT 15
      `),

      // ── Por tipo de incidente ─────────────────────────────────────────────────
      db.execute(sql`
        SELECT i.tipo, COUNT(i.id)::int AS total,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int AS mttr_avg,
          COUNT(*) FILTER (WHERE i.estado = 'RESUELTO')::int                   AS resueltos,
          COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO')::int                                     AS dentro_sla
        FROM incidentes i
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY i.tipo ORDER BY total DESC
      `),

      // ── Tiendas reincidentes (>=2 incidentes) ─────────────────────────────────
      db.execute(sql`
        WITH lagged AS (
          SELECT i.tienda_id, i.hora_registro,
            LAG(i.hora_registro) OVER (PARTITION BY i.tienda_id ORDER BY i.hora_registro) AS prev_hora
          FROM incidentes i
          WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
        ),
        gaps AS (
          SELECT tienda_id, AVG(EXTRACT(EPOCH FROM (hora_registro - prev_hora)) / 86400.0) AS avg_dias
          FROM lagged WHERE prev_hora IS NOT NULL
          GROUP BY tienda_id
        )
        SELECT t.codigo, t.nombre_cc, t.distrito,
          COALESCE(pi.nombre, pt.nombre)  AS proveedor,
          COUNT(i.id)::int                AS incidentes,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int AS mttr_avg,
          ROUND(MAX(g.avg_dias), 1)       AS dias_entre_caidas
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        LEFT JOIN gaps g ON g.tienda_id = i.tienda_id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
        HAVING COUNT(i.id) >= 2
        ORDER BY incidentes DESC
      `),

      // ── Distribución por zona ─────────────────────────────────────────────────
      db.execute(sql`
        SELECT
          CASE
            WHEN LOWER(t.provincia) IS DISTINCT FROM 'lima' THEN 'Provincia'
            WHEN LOWER(t.distrito) IN (
              'independencia','comas','los olivos',
              'san martín de porres','san martin de porres',
              'carabayllo','puente piedra','ancón','ancon'
            ) THEN 'Lima Norte'
            WHEN LOWER(t.distrito) IN (
              'san juan de lurigancho','santa anita','la molina',
              'ate','el agustino','lurigancho','chaclacayo'
            ) THEN 'Lima Este'
            WHEN LOWER(t.distrito) IN (
              'callao','ventanilla','la punta',
              'bellavista','la perla','carmen de la legua'
            ) THEN 'Callao'
            WHEN LOWER(t.distrito) IN (
              'chorrillos','san juan de miraflores',
              'villa el salvador','villa maria del triunfo','villa maría del triunfo',
              'lurín','lurin','pachacamac'
            ) THEN 'Lima Sur'
            ELSE 'Lima Centro'
          END                                                                    AS zona,
          COUNT(i.id)::int                                                       AS total,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int AS mttr_avg,
          COUNT(DISTINCT i.tienda_id)::int                                       AS tiendas_afectadas
        FROM incidentes i
        LEFT JOIN tiendas t ON i.tienda_id = t.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
        GROUP BY zona ORDER BY total DESC
      `),

      // ── Tendencia SLA últimos 6 meses por proveedor (ventana fija) ────────────
      db.execute(sql`
        SELECT TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima','YYYY-MM') AS mes,
          COALESCE(pi.nombre, pt.nombre) AS proveedor,
          COUNT(i.id)::int               AS total,
          COUNT(*) FILTER (WHERE i.estado = 'RESUELTO')::int AS resueltos,
          ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
              WHEN 'CAIDA_TOTAL' THEN 60 WHEN 'INTERMITENCIA' THEN 120
              WHEN 'LENTITUD'    THEN 240 WHEN 'POS' THEN 60 ELSE 120 END
            AND i.estado = 'RESUELTO') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
          ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int AS mttr_avg
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= (NOW() AT TIME ZONE 'America/Lima' - INTERVAL '6 months')
          AND i.estado != 'CANCELADO'
        GROUP BY mes, COALESCE(pi.nombre, pt.nombre)
        HAVING COUNT(*) FILTER (WHERE i.estado = 'RESUELTO') >= 2
        ORDER BY mes, COALESCE(pi.nombre, pt.nombre)
      `),
    ])

    const t0 = (tot    as any[])[0] ?? {}
    const t1 = (totAnt as any[])[0] ?? {}
    const provs    = porProv      as any[]
    const tiendas  = top15        as any[]
    const tipos    = porTipo      as any[]
    const reinc    = reincidentes as any[]
    const zonas    = porZona      as any[]
    const tendRows = slaTend      as any[]

    const totalTipos = tipos.reduce((s: number, r: any) => s + Number(r.total), 0)

    function varPct(curr: number, prev: number) {
      if (!prev) return '—'
      const d = Math.round((curr - prev) / prev * 100)
      return d >= 0 ? `+${d}%` : `${d}%`
    }
    function varAbs(curr: number, prev: number) {
      if (!prev && prev !== 0) return '—'
      const d = curr - prev
      return d >= 0 ? `+${d}` : `${d}`
    }

    const lines: string[] = ['﻿']
    const CRLF = '\r\n'
    const add   = (...cols: unknown[]) => lines.push(row(...cols))
    const blank = () => lines.push('')

    // ── Encabezado ───────────────────────────────────────────────────────────────
    add('REPORTE GERENCIAL — NETDESK FOOTLOOSE PERÚ')
    add('Período:', `${fmtFecha(desde)} al ${fmtFecha(hasta)}`)
    add('Generado:', new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }))
    blank()

    // ── 1. Resumen ejecutivo ─────────────────────────────────────────────────────
    add('1. RESUMEN EJECUTIVO')
    add('Métrica', 'Valor actual', 'Período anterior', 'Variación')
    add('Total incidentes',
      t0.total ?? 0,
      t1.total ?? 0,
      varPct(Number(t0.total), Number(t1.total)))
    add('Incidentes abiertos',     t0.abiertos    ?? 0, '', '—')
    add('Incidentes en proceso',   t0.en_proceso  ?? 0, '', '—')
    add('MTTR promedio',
      fmtMin(Number(t0.mttr_avg)),
      fmtMin(Number(t1.mttr_avg)),
      varAbs(Number(t0.mttr_avg), Number(t1.mttr_avg)) + ' min')
    add('Cumplimiento SLA',
      `${t0.sla_pct ?? 0}%`,
      `${t1.sla_pct ?? 0}%`,
      varAbs(Number(t0.sla_pct), Number(t1.sla_pct)) + ' pp')
    add('Tiendas afectadas',
      `${t0.tiendas ?? 0} de ${totalTiendas}`,
      `${t1.tiendas ?? 0} de ${totalTiendas}`,
      '—')
    add('Impacto económico estimado (IEI)',
      `S/ ${(Number(t0.iei_total) || 0).toLocaleString('es-PE')}`,
      `S/ ${(Number(t1.iei_total) || 0).toLocaleString('es-PE')}`,
      varPct(Number(t0.iei_total), Number(t1.iei_total)))
    blank()

    // ── 2. Métricas por proveedor ────────────────────────────────────────────────
    add('2. MÉTRICAS POR PROVEEDOR')
    add('Proveedor', 'Incidentes', 'Evaluables SLA', 'SLA Respuesta %', 'SLA Resolución %', 'SLA Global %',
      'MTTR prom (min)', 'T. respuesta N1 prom (min)', 'Escalados N2+',
      'Tiendas afectadas', 'IEI est (S/)')
    for (const p of provs)
      add(p.proveedor, p.incidentes, p.evaluables_sla ?? 0,
        p.sla_respuesta_pct != null ? `${p.sla_respuesta_pct}%` : '—',
        p.sla_resolucion_pct != null ? `${p.sla_resolucion_pct}%` : '—',
        p.sla_pct != null ? `${p.sla_pct}%` : '—',
        p.mttr_avg ?? '—', p.t_resp_prov_avg ?? '—', p.escalados_n2 ?? 0,
        p.tiendas_afectadas, p.iei ?? 0)
    blank()

    // ── 3. Top 15 tiendas más afectadas ─────────────────────────────────────────
    add('3. TOP 15 TIENDAS MÁS AFECTADAS')
    add('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Incidentes', 'MTTR prom (min)', 'IEI est (S/)')
    tiendas.forEach((t, idx) =>
      add(idx + 1, t.codigo, t.nombre_cc ?? '', t.distrito ?? '', t.proveedor ?? '',
        t.incidentes, t.mttr_avg ?? '—', t.iei ?? 0))
    blank()

    // ── 4. Distribución por tipo de incidente ────────────────────────────────────
    add('4. DISTRIBUCIÓN POR TIPO DE INCIDENTE')
    add('Tipo', 'Total', '% del total', 'Resueltos', 'Dentro SLA', 'SLA %', 'MTTR prom (min)')
    for (const t of tipos) {
      const pct  = totalTipos > 0 ? Math.round(Number(t.total) / totalTipos * 100) : 0
      const slaPctTipo = Number(t.resueltos) > 0
        ? Math.round(Number(t.dentro_sla) / Number(t.resueltos) * 100)
        : null
      add(t.tipo, t.total, `${pct}%`, t.resueltos ?? 0, t.dentro_sla ?? 0,
        slaPctTipo != null ? `${slaPctTipo}%` : '—', t.mttr_avg ?? '—')
    }
    blank()

    // ── 5. Tiendas reincidentes ──────────────────────────────────────────────────
    add('5. TIENDAS REINCIDENTES (≥2 incidentes en el período)')
    if (reinc.length === 0) {
      add('Sin reincidencias en el período')
    } else {
      add('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Incidentes', 'MTTR prom (min)', 'Días prom entre caídas')
      reinc.forEach((r, idx) =>
        add(idx + 1, r.codigo, r.nombre_cc ?? '', r.distrito ?? '', r.proveedor ?? '',
          r.incidentes, r.mttr_avg ?? '—', r.dias_entre_caidas != null ? r.dias_entre_caidas : '—'))
    }
    blank()

    // ── 6. Distribución por zona geográfica ──────────────────────────────────────
    add('6. DISTRIBUCIÓN POR ZONA GEOGRÁFICA')
    add('Zona', 'Incidentes', '% del total', 'Tiendas afectadas', 'MTTR prom (min)')
    const totalZona = zonas.reduce((s: number, z: any) => s + Number(z.total), 0)
    for (const z of zonas) {
      const pct = totalZona > 0 ? Math.round(Number(z.total) / totalZona * 100) : 0
      add(z.zona, z.total, `${pct}%`, z.tiendas_afectadas, z.mttr_avg ?? '—')
    }
    blank()

    // ── 7. Tendencia SLA últimos 6 meses ─────────────────────────────────────────
    add('7. TENDENCIA SLA — ÚLTIMOS 6 MESES (ventana fija, independiente del período)')
    if (tendRows.length === 0) {
      add('Sin datos suficientes')
    } else {
      const meses     = [...new Set(tendRows.map((r: any) => r.mes as string))].sort()
      const proveedoresTend = [...new Set(tendRows.map((r: any) => r.proveedor as string))].filter(Boolean)
      const map: Record<string, Record<string, any>> = {}
      for (const r of tendRows) {
        if (!map[r.proveedor]) map[r.proveedor] = {}
        map[r.proveedor][r.mes] = r
      }
      // Header row: Proveedor + mes columns (SLA% / MTTR / Total)
      add('Proveedor', ...meses.flatMap(m => [`SLA% ${fmtMes(m)}`, `MTTR (min) ${fmtMes(m)}`, `Incs ${fmtMes(m)}`]))
      for (const prov of proveedoresTend) {
        const cols: unknown[] = [prov]
        for (const m of meses) {
          const r = map[prov]?.[m]
          cols.push(r?.sla_pct != null ? `${r.sla_pct}%` : '—')
          cols.push(r?.mttr_avg ?? '—')
          cols.push(r?.total ?? '—')
        }
        add(...cols)
      }
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
