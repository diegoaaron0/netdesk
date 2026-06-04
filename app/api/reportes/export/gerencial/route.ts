import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getTotalTiendas } from '@/lib/tiendas-stats'
import { SLA_MTTR_POR_TIPO, SLA_MTTR_DEFAULT_MIN } from '@/lib/sla-core'

// ── SQL helpers — plain strings, never Drizzle objects ───────────────────────

function slaCase(col = 'i.tipo'): string {
  const t = SLA_MTTR_POR_TIPO
  return (
    `CASE ${col}` +
    ` WHEN 'CAIDA_TOTAL' THEN ${t.CAIDA_TOTAL}` +
    ` WHEN 'INTERMITENCIA' THEN ${t.INTERMITENCIA}` +
    ` WHEN 'LENTITUD' THEN ${t.LENTITUD}` +
    ` WHEN 'POS' THEN ${t.POS}` +
    ` WHEN 'OTROS' THEN ${t.OTROS}` +
    ` WHEN 'CORTE_ELECTRICO' THEN ${t.CORTE_ELECTRICO}` +
    ` ELSE ${SLA_MTTR_DEFAULT_MIN} END`
  )
}

function clusterFallback(): string {
  return `CASE t.cluster WHEN 'A' THEN 601 WHEN 'B' THEN 360 WHEN 'C' THEN 262 WHEN 'D' THEN 153 ELSE 0 END`
}

function ieiFactor(): string {
  return `CASE
    WHEN i.tipo = 'CORTE_ELECTRICO' THEN
      CASE
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) = 'PARCIAL'                                        THEN 0.30
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) IN ('NULA','FALLIDA','NO_FUNCIONO','INOPERATIVA')  THEN 1.00
        WHEN i.boleta_manual = true                                                                                     THEN 0.00
        ELSE 1.00
      END
    ELSE LEAST(
      CASE i.tipo WHEN 'CAIDA_TOTAL' THEN 1.00 WHEN 'INTERMITENCIA' THEN 0.50 WHEN 'LENTITUD' THEN 0.30 ELSE 1.00 END,
      CASE WHEN i.cont_activado_por IS NOT NULL THEN
        CASE
          WHEN i.cont_rendimiento IS NULL                                               THEN 0.20
          WHEN UPPER(i.cont_rendimiento) IN ('EFECTIVO','TOTAL','EFECTIVA')            THEN 0.00
          WHEN UPPER(i.cont_rendimiento) IN ('PARCIAL','LIMITADA')                    THEN 0.20
          ELSE 1.00
        END
      ELSE 9.99 END,
      CASE WHEN i.mov_activado_por IS NOT NULL THEN
        CASE
          WHEN i.mov_rendimiento IS NULL                                                THEN 0.20
          WHEN UPPER(i.mov_rendimiento) IN ('EFECTIVO','TOTAL','EFECTIVA')             THEN 0.00
          WHEN UPPER(i.mov_rendimiento) IN ('PARCIAL','LIMITADA')                     THEN 0.20
          ELSE 1.00
        END
      ELSE 9.99 END,
      CASE WHEN i.boleta_manual = true THEN
        CASE
          WHEN i.boleta_rendimiento IS NULL                                             THEN 0.10
          WHEN UPPER(i.boleta_rendimiento) IN ('EFECTIVA','TOTAL')                    THEN 0.10
          WHEN UPPER(i.boleta_rendimiento) = 'PARCIAL'                               THEN 0.30
          ELSE 1.00
        END
      ELSE 9.99 END
    )
  END`
}

// ROUND(SUM( vh * (mttr/60) * 0.35 * factor ))::int
function ieiSum(): string {
  return (
    `ROUND(SUM(` +
    `COALESCE(t.venta_hora_soles, ${clusterFallback()})` +
    ` * (COALESCE(i.mttr_minutos, 0)::numeric / 60)` +
    ` * 0.35` +
    ` * (${ieiFactor()})` +
    `))::int`
  )
}

// ── Formatters ───────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}
function row(...cols: unknown[]) { return cols.map(esc).join(',') }

function fmtFecha(iso: string) {
  const lima = new Date(new Date(iso).getTime() - 5 * 3600000)
  return `${String(lima.getUTCDate()).padStart(2,'0')}/${String(lima.getUTCMonth()+1).padStart(2,'0')}/${lima.getUTCFullYear()}`
}
function fmtMin(min: number | null) {
  if (!min) return ''
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Per-section error wrapper ────────────────────────────────────────────────
async function runSection<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    throw new Error(`[sección: ${label}] ${err?.message ?? String(err)}`)
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const desdeParam = searchParams.get('desde')
    const hastaParam = searchParams.get('hasta')

    const hasta = hastaParam
      ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
      : new Date().toISOString()
    const desde = desdeParam
      ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
      : (() => { const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString() })()

    const durMs    = new Date(hasta).getTime() - new Date(desde).getTime()
    const desdeAnt = new Date(new Date(desde).getTime() - durMs).toISOString()

    const totalTiendas = await getTotalTiendas()

    const [tot, totAnt, porProv, top15, porTipo, reincidentes, porZona, reaperturas, supervisores, clusters] =
      await Promise.all([

        // 1. Totales período actual
        runSection('totales', () => db.execute(sql`
          SELECT
            COUNT(i.id)::int                                                         AS total,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int   AS mttr_avg,
            ROUND(
              COUNT(*) FILTER (
                WHERE i.mttr_minutos <= ${sql.raw(slaCase())}
                  AND i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ) * 100.0 /
              NULLIF(COUNT(*) FILTER (
                WHERE i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ), 0)
            )::int                                                                   AS sla_pct,
            COUNT(DISTINCT i.tienda_id)::int                                        AS tiendas,
            ${sql.raw(ieiSum())}                                                     AS iei_total,
            COUNT(*) FILTER (WHERE i.estado = 'ABIERTO')::int                      AS abiertos,
            COUNT(*) FILTER (
              WHERE i.estado NOT IN ('ABIERTO','RESUELTO','CANCELADO','CERRADO')
            )::int                                                                   AS en_proceso
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
        `)),

        // 2. Totales período anterior (para variación)
        runSection('totales-ant', () => db.execute(sql`
          SELECT
            COUNT(i.id)::int                                                         AS total,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int   AS mttr_avg,
            ROUND(
              COUNT(*) FILTER (
                WHERE i.mttr_minutos <= ${sql.raw(slaCase())}
                  AND i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ) * 100.0 /
              NULLIF(COUNT(*) FILTER (
                WHERE i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ), 0)
            )::int                                                                   AS sla_pct,
            COUNT(DISTINCT i.tienda_id)::int                                        AS tiendas,
            ${sql.raw(ieiSum())}                                                     AS iei_total
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          WHERE i.hora_registro >= ${desdeAnt}::timestamptz
            AND i.hora_registro <  ${desde}::timestamptz
            AND i.estado != 'CANCELADO'
        `)),

        // 3. Por proveedor
        runSection('por-proveedor', () => db.execute(sql`
          SELECT
            COALESCE(pi.nombre, pt.nombre)                                          AS proveedor,
            COUNT(i.id)::int                                                        AS incidentes,
            COUNT(i.id) FILTER (
              WHERE i.estado = 'RESUELTO'
                AND n1h.hora_correo_n1 IS NOT NULL
                AND i.evaluable_proveedor IS NOT FALSE
                AND i.tipo != 'CORTE_ELECTRICO'
            )::int                                                                  AS evaluables_sla,
            ROUND(
              COUNT(*) FILTER (
                WHERE i.mttr_minutos <= ${sql.raw(slaCase())}
                  AND i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ) * 100.0 /
              NULLIF(COUNT(*) FILTER (
                WHERE i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ), 0)
            )::int                                                                  AS sla_pct,
            ROUND(
              COUNT(*) FILTER (
                WHERE n1h.hora_correo_n1 IS NOT NULL
                  AND resp.hora_primera_resp IS NOT NULL
                  AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1)) / 60 <= 60
              ) * 100.0 /
              NULLIF(COUNT(*) FILTER (WHERE n1h.hora_correo_n1 IS NOT NULL), 0)
            )::int                                                                  AS sla_respuesta_pct,
            ROUND(
              COUNT(*) FILTER (
                WHERE i.mttr_minutos <= ${sql.raw(slaCase())}
                  AND i.estado = 'RESUELTO'
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ) * 100.0 /
              NULLIF(COUNT(*) FILTER (
                WHERE i.estado = 'RESUELTO'
                  AND n1h.hora_correo_n1 IS NOT NULL
                  AND i.evaluable_proveedor IS NOT FALSE
                  AND i.tipo != 'CORTE_ELECTRICO'
              ), 0)
            )::int                                                                  AS sla_resolucion_pct,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int  AS mttr_avg,
            ROUND(AVG(
              EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1)) / 60
            ))::int                                                                 AS t_resp_prov_avg,
            ROUND(AVG(i.mttr_minutos) FILTER (
              WHERE i.estado = 'RESUELTO'
                AND i.evaluable_proveedor IS NOT FALSE
                AND i.tipo != 'CORTE_ELECTRICO'
            ))::int                                                                 AS t_resol_prov_avg,
            COUNT(DISTINCT e2.incidente_id)::int                                   AS escalados_n2,
            COUNT(DISTINCT i.tienda_id)::int                                       AS tiendas_afectadas,
            ${sql.raw(ieiSum())}                                                    AS iei
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
          LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
          LEFT JOIN LATERAL (
            SELECT MIN(e.hora_envio_correo) AS hora_correo_n1
            FROM escalamientos e
            WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
          ) n1h ON true
          LEFT JOIN LATERAL (
            SELECT MIN(e.hora_respuesta) AS hora_primera_resp
            FROM escalamientos e
            WHERE e.incidente_id = i.id
              AND e.hora_respuesta IS NOT NULL
              AND e.no_hubo_respuesta IS NOT TRUE
          ) resp ON true
          LEFT JOIN LATERAL (
            SELECT DISTINCT incidente_id
            FROM escalamientos e
            WHERE e.incidente_id = i.id AND e.nivel >= 2
            LIMIT 1
          ) e2 ON true
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY COALESCE(pi.nombre, pt.nombre)
          ORDER BY iei DESC NULLS LAST
        `)),

        // 4. Top 15 tiendas
        runSection('top15', () => db.execute(sql`
          SELECT
            t.codigo, t.nombre_cc, t.distrito,
            COALESCE(pi.nombre, pt.nombre)                                         AS proveedor,
            COUNT(i.id)::int                                                       AS incidentes,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int AS mttr_avg,
            ${sql.raw(ieiSum())}                                                   AS iei
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
          LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
          ORDER BY incidentes DESC
          LIMIT 15
        `)),

        // 5. Distribución por tipo
        runSection('por-tipo', () => db.execute(sql`
          SELECT
            i.tipo,
            COUNT(i.id)::int                                                              AS total,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int        AS mttr_avg,
            COUNT(*) FILTER (WHERE i.estado = 'RESUELTO')::int                          AS resueltos,
            COUNT(*) FILTER (
              WHERE i.mttr_minutos <= ${sql.raw(slaCase())}
                AND i.estado = 'RESUELTO'
            )::int                                                                        AS dentro_sla
          FROM incidentes i
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY i.tipo
          ORDER BY total DESC
        `)),

        // 6. Reincidentes — avg_dias cast a numeric en CTE para que ROUND(numeric,1) sea válido
        runSection('reincidentes', () => db.execute(sql`
          WITH lagged AS (
            SELECT
              i.tienda_id,
              i.hora_registro,
              LAG(i.hora_registro) OVER (PARTITION BY i.tienda_id ORDER BY i.hora_registro) AS prev_hora
            FROM incidentes i
            WHERE i.hora_registro >= ${desde}::timestamptz
              AND i.hora_registro <  ${hasta}::timestamptz
              AND i.estado != 'CANCELADO'
          ),
          gaps AS (
            SELECT
              tienda_id,
              AVG(EXTRACT(EPOCH FROM (hora_registro - prev_hora)) / 86400.0)::numeric AS avg_dias
            FROM lagged
            WHERE prev_hora IS NOT NULL
            GROUP BY tienda_id
          )
          SELECT
            t.codigo, t.nombre_cc, t.distrito,
            COALESCE(pi.nombre, pt.nombre)                                               AS proveedor,
            COUNT(i.id)::int                                                             AS incidentes,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int       AS mttr_avg,
            ROUND(MAX(g.avg_dias), 1)                                                   AS dias_entre_caidas,
            MODE() WITHIN GROUP (ORDER BY i.tipo)                                       AS tipo_frecuente,
            (SELECT COUNT(*)::int FROM incidentes i2
             WHERE i2.tienda_id = t.id
               AND i2.hora_registro >= ${desdeAnt}::timestamptz
               AND i2.hora_registro <  ${desde}::timestamptz
               AND i2.estado != 'CANCELADO')                                            AS incidentes_prev
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
          LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
          LEFT JOIN gaps g ON g.tienda_id = i.tienda_id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
          HAVING COUNT(i.id) >= 2
          ORDER BY incidentes DESC
        `)),

        // 7. Distribución por zona geográfica
        runSection('por-zona', () => db.execute(sql`
          SELECT
            CASE
              WHEN LOWER(t.provincia) IS DISTINCT FROM 'lima'                                        THEN 'Provincia'
              WHEN LOWER(t.distrito) IN ('independencia','comas','los olivos','san martín de porres','san martin de porres','carabayllo','puente piedra','ancón','ancon') THEN 'Lima Norte'
              WHEN LOWER(t.distrito) IN ('san juan de lurigancho','santa anita','la molina','ate','el agustino','lurigancho','chaclacayo') THEN 'Lima Este'
              WHEN LOWER(t.distrito) IN ('callao','ventanilla','la punta','bellavista','la perla','carmen de la legua') THEN 'Callao'
              WHEN LOWER(t.distrito) IN ('chorrillos','san juan de miraflores','villa el salvador','villa maria del triunfo','villa maría del triunfo','lurín','lurin','pachacamac') THEN 'Lima Sur'
              ELSE 'Lima Centro'
            END                                                                                      AS zona,
            COUNT(i.id)::int                                                                         AS total,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int                  AS mttr_avg,
            COUNT(DISTINCT i.tienda_id)::int                                                        AS tiendas_afectadas
          FROM incidentes i
          LEFT JOIN tiendas t ON i.tienda_id = t.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY zona
          ORDER BY total DESC
        `)),

        // 8. Reaperturas por proveedor
        runSection('reaperturas', () => db.execute(sql`
          SELECT
            COALESCE(pi.nombre, pt.nombre)                                                         AS proveedor,
            COUNT(i.id)::int                                                                       AS total,
            COUNT(*) FILTER (WHERE i.motivo_reabertura IS NOT NULL)::int                          AS reaperturas,
            ROUND(COUNT(*) FILTER (WHERE i.motivo_reabertura IS NOT NULL) * 100.0 / NULLIF(COUNT(i.id), 0), 1) AS tasa_reapertura,
            COUNT(*) FILTER (WHERE i.motivo_reabertura = 'TIENDA_SIN_INTERNET')::int             AS motivo_proveedor,
            COUNT(*) FILTER (WHERE i.motivo_reabertura = 'ERROR_AGENTE')::int                    AS motivo_agente
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
          LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY COALESCE(pi.nombre, pt.nombre)
          ORDER BY reaperturas DESC NULLS LAST
        `)),

        // 9. Carga por supervisor
        runSection('supervisores', () => db.execute(sql`
          SELECT
            COALESCE(t.supervisor_nombre, 'Sin supervisor')                                       AS supervisor,
            COUNT(i.id)::int                                                                       AS incidentes,
            COUNT(DISTINCT i.tienda_id)::int                                                      AS tiendas,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int                AS mttr_avg,
            ${sql.raw(ieiSum())}                                                                   AS iei_total
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY COALESCE(t.supervisor_nombre, 'Sin supervisor')
          ORDER BY incidentes DESC
        `)),

        // 10. Distribución por cluster
        runSection('clusters', () => db.execute(sql`
          SELECT
            COALESCE(t.cluster, 'Sin cluster')                                                    AS cluster,
            COUNT(i.id)::int                                                                       AS incidentes,
            COUNT(DISTINCT i.tienda_id)::int                                                      AS tiendas_afectadas,
            ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int                AS mttr_avg,
            ${sql.raw(ieiSum())}                                                                   AS iei_total
          FROM incidentes i
          JOIN tiendas t ON i.tienda_id = t.id
          WHERE i.hora_registro >= ${desde}::timestamptz
            AND i.hora_registro <  ${hasta}::timestamptz
            AND i.estado != 'CANCELADO'
          GROUP BY COALESCE(t.cluster, 'Sin cluster')
          ORDER BY cluster
        `)),
      ])

    // ── Aliasing de resultados ────────────────────────────────────────────────

    const t0      = (tot         as any[])[0] ?? {}
    const t1      = (totAnt      as any[])[0] ?? {}
    const provs   = porProv      as any[]
    const tiendas = top15        as any[]
    const tipos   = porTipo      as any[]
    const reinc   = reincidentes as any[]
    const zonas   = porZona      as any[]
    const reabRows = reaperturas as any[]
    const supRows = supervisores as any[]
    const clRows  = clusters     as any[]

    const totalTipos = tipos.reduce((s: number, r: any) => s + Number(r.total), 0)

    function varPct(curr: number, prev: number) {
      if (!prev) return '—'
      const d = Math.round((curr - prev) / prev * 100)
      return d >= 0 ? `+${d}%` : `${d}%`
    }
    function varAbs(curr: number, prev: number) {
      if (prev == null) return '—'
      const d = curr - prev
      return d >= 0 ? `+${d}` : `${d}`
    }

    // ── Construcción del CSV ──────────────────────────────────────────────────

    const lines: string[] = ['﻿'] // BOM UTF-8
    const CRLF = '\r\n'
    const add   = (...cols: unknown[]) => lines.push(row(...cols))
    const blank = () => lines.push('')

    add('REPORTE GERENCIAL — NETDESK FOOTLOOSE PERÚ')
    add('Período:', `${fmtFecha(desde)} al ${fmtFecha(hasta)}`)
    add('Generado:', new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }))
    blank()

    // 1. Resumen ejecutivo
    add('1. RESUMEN EJECUTIVO')
    add('Métrica', 'Valor actual', 'Período anterior', 'Variación')
    add('Total incidentes',
      t0.total ?? 0, t1.total ?? 0,
      varPct(Number(t0.total), Number(t1.total)))
    add('Incidentes abiertos',   t0.abiertos   ?? 0, '', '—')
    add('Incidentes en proceso', t0.en_proceso ?? 0, '', '—')
    add('MTTR promedio',
      fmtMin(Number(t0.mttr_avg)),
      fmtMin(Number(t1.mttr_avg)),
      varAbs(Number(t0.mttr_avg), Number(t1.mttr_avg)) + ' min')
    add('Cumplimiento SLA',
      `${t0.sla_pct ?? 0}%`, `${t1.sla_pct ?? 0}%`,
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

    // 2. Métricas por proveedor
    add('2. MÉTRICAS POR PROVEEDOR')
    add('Proveedor', 'Incidentes', 'Evaluables SLA',
      'SLA Respuesta %', 'SLA Resolución %', 'SLA Global %',
      'MTTR prom (min)', 'T. respuesta prom (min)', 'T. resolución prom (min)',
      'Escalados N2+', 'Tiendas afectadas', 'IEI est (S/)')
    for (const p of provs)
      add(p.proveedor, p.incidentes, p.evaluables_sla ?? 0,
        p.sla_respuesta_pct  != null ? `${p.sla_respuesta_pct}%`  : '—',
        p.sla_resolucion_pct != null ? `${p.sla_resolucion_pct}%` : '—',
        p.sla_pct            != null ? `${p.sla_pct}%`            : '—',
        p.mttr_avg ?? '—', p.t_resp_prov_avg ?? '—', p.t_resol_prov_avg ?? '—',
        p.escalados_n2 ?? 0, p.tiendas_afectadas, p.iei ?? 0)
    blank()

    // 3. Top 15 tiendas
    add('3. TOP 15 TIENDAS MÁS AFECTADAS')
    add('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Incidentes', 'MTTR prom (min)', 'IEI est (S/)')
    tiendas.forEach((t, idx) =>
      add(idx + 1, t.codigo, t.nombre_cc ?? '', t.distrito ?? '', t.proveedor ?? '',
        t.incidentes, t.mttr_avg ?? '—', t.iei ?? 0))
    blank()

    // 4. Distribución por tipo
    add('4. DISTRIBUCIÓN POR TIPO DE INCIDENTE')
    add('Tipo', 'Total', '% del total', 'Resueltos', 'Dentro SLA', 'SLA %', 'MTTR prom (min)')
    for (const t of tipos) {
      const pct = totalTipos > 0 ? Math.round(Number(t.total) / totalTipos * 100) : 0
      const slaPctTipo = Number(t.resueltos) > 0
        ? Math.round(Number(t.dentro_sla) / Number(t.resueltos) * 100)
        : null
      add(t.tipo, t.total, `${pct}%`, t.resueltos ?? 0, t.dentro_sla ?? 0,
        slaPctTipo != null ? `${slaPctTipo}%` : '—', t.mttr_avg ?? '—')
    }
    blank()

    // 5. Reincidentes
    add('5. TIENDAS REINCIDENTES (≥2 incidentes en el período)')
    if (reinc.length === 0) {
      add('Sin reincidencias en el período')
    } else {
      add('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor',
        'Incidentes', 'MTTR prom (min)', 'Días prom entre caídas', 'Tipo frecuente', 'Tendencia')
      reinc.forEach((r, idx) => {
        const tendencia = Number(r.incidentes_prev) >= 2
          ? Number(r.incidentes) > Number(r.incidentes_prev) ? 'EMPEORA' : 'ESTABLE'
          : 'NUEVO'
        add(idx + 1, r.codigo, r.nombre_cc ?? '', r.distrito ?? '', r.proveedor ?? '',
          r.incidentes, r.mttr_avg ?? '—',
          r.dias_entre_caidas != null ? r.dias_entre_caidas : '—',
          r.tipo_frecuente ?? '—', tendencia)
      })
    }
    blank()

    // 6. Distribución por zona
    add('6. DISTRIBUCIÓN POR ZONA GEOGRÁFICA')
    add('Zona', 'Incidentes', '% del total', 'Tiendas afectadas', 'MTTR prom (min)')
    const totalZona = zonas.reduce((s: number, z: any) => s + Number(z.total), 0)
    for (const z of zonas) {
      const pct = totalZona > 0 ? Math.round(Number(z.total) / totalZona * 100) : 0
      add(z.zona, z.total, `${pct}%`, z.tiendas_afectadas, z.mttr_avg ?? '—')
    }
    blank()

    // 7. Reaperturas
    blank()
    const totalReab    = reabRows.reduce((s: number, r: any) => s + Number(r.reaperturas ?? 0), 0)
    const totalIncReab = reabRows.reduce((s: number, r: any) => s + Number(r.total        ?? 0), 0)
    const tasaGlobal   = totalIncReab > 0 ? Math.round(totalReab / totalIncReab * 1000) / 10 : 0
    add('7. REAPERTURAS')
    add('Total reaperturas en el período:', totalReab)
    add('Tasa global de reapertura:', `${tasaGlobal}%`)
    blank()
    if (totalReab === 0) {
      add('Sin reaperturas en el período')
    } else {
      add('Proveedor', 'Total incidentes', 'Reaperturas', 'Tasa (%)',
        'Motivo: proveedor (sin internet)', 'Motivo: error agente')
      for (const r of reabRows)
        add(r.proveedor ?? '—', r.total, r.reaperturas ?? 0,
          r.tasa_reapertura != null ? `${r.tasa_reapertura}%` : '0%',
          r.motivo_proveedor ?? 0, r.motivo_agente ?? 0)
    }

    // 8. Proveedor crítico
    blank()
    add('8. PROVEEDOR CRÍTICO')
    if (provs.length === 0) {
      add('Sin datos de proveedores en el período')
    } else {
      const maxInc  = Math.max(...provs.map((p: any) => Number(p.incidentes) || 0), 1)
      const maxMttr = Math.max(...provs.map((p: any) => Number(p.mttr_avg)   || 0), 1)
      const scored = provs
        .map((p: any) => {
          const inc   = Number(p.incidentes) || 0
          const sla   = p.sla_pct != null ? Number(p.sla_pct) : 100
          const mttr  = Number(p.mttr_avg) || 0
          const score = Math.round((inc / maxInc) * 40 + ((100 - sla) / 100) * 40 + (mttr / maxMttr) * 20)
          return { ...p, score }
        })
        .sort((a: any, b: any) => b.score - a.score)
      const top = scored[0]
      add('Proveedor', 'Score riesgo (0-100)', 'Incidentes', 'SLA Global %', 'MTTR prom (min)', 'IEI est (S/)')
      add(top.proveedor, top.score, top.incidentes,
        top.sla_pct != null ? `${top.sla_pct}%` : '—', top.mttr_avg ?? '—', top.iei ?? 0)
      if (scored.length > 1) {
        blank()
        add('Ranking completo de proveedores por riesgo')
        add('#', 'Proveedor', 'Score', 'Incidentes', 'SLA %', 'MTTR (min)', 'IEI (S/)')
        scored.forEach((p: any, idx: number) =>
          add(idx + 1, p.proveedor, p.score, p.incidentes,
            p.sla_pct != null ? `${p.sla_pct}%` : '—', p.mttr_avg ?? '—', p.iei ?? 0))
      }
    }

    // 9. Supervisores
    blank()
    add('9. CARGA POR SUPERVISOR')
    if (supRows.length === 0) {
      add('Sin datos de supervisores')
    } else {
      add('Supervisor', 'Incidentes', 'Tiendas afectadas', 'MTTR prom (min)', 'IEI total est (S/)')
      for (const s of supRows)
        add(s.supervisor, s.incidentes, s.tiendas, s.mttr_avg ?? '—', s.iei_total ?? 0)
    }

    // 10. Clusters
    blank()
    add('10. DISTRIBUCIÓN POR CLUSTER')
    if (clRows.length === 0) {
      add('Sin datos de clusters')
    } else {
      const totalCluster = clRows.reduce((s: number, c: any) => s + Number(c.incidentes), 0)
      add('Cluster', 'Incidentes', '% del total', 'Tiendas afectadas', 'MTTR prom (min)', 'IEI total est (S/)')
      for (const c of clRows) {
        const pct = totalCluster > 0 ? Math.round(Number(c.incidentes) / totalCluster * 100) : 0
        add(c.cluster, c.incidentes, `${pct}%`, c.tiendas_afectadas, c.mttr_avg ?? '—', c.iei_total ?? 0)
      }
    }

    const csv = lines.join(CRLF)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_gerencial_${desde.slice(0,10)}_${hasta.slice(0,10)}.csv"`,
      },
    })

  } catch (err: any) {
    console.error('[export/gerencial]', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno al generar el reporte' }, { status: 500 })
  }
}
