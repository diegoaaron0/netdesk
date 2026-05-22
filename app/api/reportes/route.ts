import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? new Date(Date.now() - 30 * 86400000).toISOString()
  const hasta = searchParams.get('hasta') ?? new Date().toISOString()
  const durMs = new Date(hasta).getTime() - new Date(desde).getTime()
  const desdeAnt = new Date(new Date(desde).getTime() - durMs).toISOString()

  const [tot, totAnt, byDay, byTipo, mttrProv, slaProv, topTiendas, reinc, byZona, slaTend, mttrZonaMes] = await Promise.all([
    // ── Totales del período ─────────────────────────────────────────────────────
    db.execute(sql`
      SELECT COUNT(i.id)::int AS total,
        ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
        ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
            WHEN 'CAIDA_TOTAL'   THEN 60
            WHEN 'INTERMITENCIA' THEN 120
            WHEN 'LENTITUD'      THEN 240
            WHEN 'POS'           THEN 60
            ELSE 120 END
          AND i.estado = 'RESUELTO') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct,
        COUNT(DISTINCT i.tienda_id)::int AS tiendas,
        ROUND(SUM(
          COALESCE(t.venta_hora_soles,
            CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
              WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
          * (COALESCE(i.mttr_minutos, 0)::numeric / 60)
          * 0.35
          * CASE i.tipo
              WHEN 'CAIDA_TOTAL'   THEN 1.00
              WHEN 'INTERMITENCIA' THEN 0.75
              WHEN 'LENTITUD'      THEN 0.30
              WHEN 'POS'           THEN 0.40
              ELSE 0.60 END
        ))::int AS iei_total
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
    `),
    // ── Totales período anterior ────────────────────────────────────────────────
    db.execute(sql`
      SELECT COUNT(*)::int AS total, ROUND(AVG(mttr_minutos))::int AS mttr_avg
      FROM incidentes
      WHERE hora_registro >= ${desdeAnt}::timestamptz AND hora_registro < ${desde}::timestamptz
    `),
    // ── Por día ─────────────────────────────────────────────────────────────────
    db.execute(sql`
      SELECT TO_CHAR(hora_registro AT TIME ZONE 'America/Lima','YYYY-MM-DD') AS dia,
        COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado='RESUELTO')::int AS resueltos
      FROM incidentes
      WHERE hora_registro >= ${desde}::timestamptz AND hora_registro < ${hasta}::timestamptz
      GROUP BY dia ORDER BY dia
    `),
    // ── Por tipo ────────────────────────────────────────────────────────────────
    db.execute(sql`
      SELECT tipo, COUNT(*)::int AS total
      FROM incidentes
      WHERE hora_registro >= ${desde}::timestamptz AND hora_registro < ${hasta}::timestamptz
      GROUP BY tipo ORDER BY total DESC
    `),
    // ── MTTR por proveedor (histórico) ──────────────────────────────────────────
    db.execute(sql`
      SELECT COALESCE(pi.nombre, pt.nombre) AS nombre,
        COUNT(i.id)::int AS total,
        ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
        COUNT(DISTINCT i.tienda_id)::int AS tiendas_afectadas
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
        AND i.estado = 'RESUELTO' AND i.mttr_minutos IS NOT NULL
      GROUP BY COALESCE(pi.nombre, pt.nombre) ORDER BY mttr_avg ASC
    `),
    // ── SLA% por proveedor (histórico, CASE por tipo) ──────────────────────────
    db.execute(sql`
      SELECT COALESCE(pi.nombre, pt.nombre) AS nombre,
        COUNT(i.id)::int AS total,
        ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
            WHEN 'CAIDA_TOTAL'   THEN 60
            WHEN 'INTERMITENCIA' THEN 120
            WHEN 'LENTITUD'      THEN 240
            WHEN 'POS'           THEN 60
            ELSE 120 END
          AND i.estado = 'RESUELTO') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
      GROUP BY COALESCE(pi.nombre, pt.nombre) HAVING COUNT(i.id) > 0
      ORDER BY sla_pct DESC NULLS LAST
    `),
    // ── Top 15 tiendas (histórico, con IEI) ────────────────────────────────────
    db.execute(sql`
      SELECT t.codigo, t.nombre_cc AS nombre, t.distrito,
        COALESCE(pi.nombre, pt.nombre) AS proveedor,
        COUNT(i.id)::int AS total,
        ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
        ROUND(SUM(
          COALESCE(t.venta_hora_soles,
            CASE t.cluster WHEN 'A' THEN 931 WHEN 'B' THEN 521
              WHEN 'C' THEN 348 WHEN 'D' THEN 197 ELSE 0 END)
          * (COALESCE(i.mttr_minutos, 0)::numeric / 60)
          * 0.35
          * CASE i.tipo
              WHEN 'CAIDA_TOTAL'   THEN 1.00
              WHEN 'INTERMITENCIA' THEN 0.75
              WHEN 'LENTITUD'      THEN 0.30
              WHEN 'POS'           THEN 0.40
              ELSE 0.60 END
        ))::int AS iei_acumulado
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
      GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
      ORDER BY total DESC LIMIT 15
    `),
    // ── Reincidencia (histórico) ────────────────────────────────────────────────
    db.execute(sql`
      SELECT t.codigo, t.nombre_cc AS nombre, t.distrito,
        COALESCE(pi.nombre, pt.nombre) AS proveedor,
        COUNT(i.id)::int AS incidentes
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
      GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito, COALESCE(pi.nombre, pt.nombre)
      HAVING COUNT(i.id) > 1 ORDER BY incidentes DESC LIMIT 8
    `),
    // ── Por zona ────────────────────────────────────────────────────────────────
    db.execute(sql`
      SELECT
        CASE
          WHEN LOWER(t.provincia) != 'lima' THEN 'Provincia'
          WHEN LOWER(t.distrito) IN ('independencia','comas','los olivos','san martín de porres','san martin de porres','carabayllo','puente piedra','ancón','ancon') THEN 'Lima Norte'
          WHEN LOWER(t.distrito) IN ('san juan de lurigancho','santa anita','la molina','ate','el agustino','lurigancho','chaclacayo') THEN 'Lima Este'
          WHEN LOWER(t.distrito) IN ('callao','ventanilla','la punta','bellavista','la perla','carmen de la legua') THEN 'Lima Callao'
          WHEN LOWER(t.distrito) IN ('chorrillos','san juan de miraflores','villa el salvador','villa maria del triunfo','villa maría del triunfo','lurín','lurin','miraflores','san isidro','san borja','surco','barranco','surquillo','la victoria','pueblo libre','magdalena','san miguel','breña','jesus maria','jesús maría','lince') THEN 'Lima Sur'
          ELSE 'Lima Centro'
        END AS zona,
        COUNT(i.id)::int AS total
      FROM incidentes i LEFT JOIN tiendas t ON i.tienda_id = t.id
      WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
      GROUP BY zona ORDER BY total DESC
    `),
    // ── Tendencia SLA 6 meses (histórico, CASE por tipo) ───────────────────────
    db.execute(sql`
      SELECT TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima','YYYY-MM') AS mes,
        COALESCE(pi.nombre, pt.nombre) AS nombre,
        ROUND(COUNT(*) FILTER (WHERE i.mttr_minutos <= CASE i.tipo
            WHEN 'CAIDA_TOTAL'   THEN 60
            WHEN 'INTERMITENCIA' THEN 120
            WHEN 'LENTITUD'      THEN 240
            WHEN 'POS'           THEN 60
            ELSE 120 END
          AND i.estado = 'RESUELTO') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE i.estado = 'RESUELTO'), 0))::int AS sla_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.hora_registro >= (NOW() - INTERVAL '6 months')
      GROUP BY mes, COALESCE(pi.nombre, pt.nombre)
      HAVING COUNT(*) FILTER (WHERE i.estado = 'RESUELTO') > 0
      ORDER BY mes, COALESCE(pi.nombre, pt.nombre)
    `),
    // ── MTTR por zona y mes ─────────────────────────────────────────────────────
    db.execute(sql`
      SELECT TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima','YYYY-MM') AS mes,
        CASE WHEN LOWER(t.provincia) = 'lima' THEN 'Lima' ELSE 'Provincia' END AS zona,
        ROUND(AVG(i.mttr_minutos))::int AS mttr_avg
      FROM incidentes i JOIN tiendas t ON i.tienda_id = t.id
      WHERE i.hora_registro >= (NOW() - INTERVAL '3 months')
        AND i.estado = 'RESUELTO' AND i.mttr_minutos IS NOT NULL
      GROUP BY mes, zona ORDER BY mes, zona
    `),
  ])

  const t0 = (tot as any[])[0] ?? {}
  const t1 = (totAnt as any[])[0] ?? {}
  const maxMttr = Math.max(...(mttrProv as any[]).map((p: any) => Number(p.mttr_avg) || 0), 1)
  const costoProveedor = [...(mttrProv as any[])]
    .sort((a: any, b: any) => (Number(a.mttr_avg) || 0) - (Number(b.mttr_avg) || 0))
    .map((p: any) => {
      const avg = Number(p.mttr_avg) || 0
      return { nombre: p.nombre, costo: avg ? Math.round(avg / 60 * 2.43 * 10) / 10 : null, pct: Math.round(avg / maxMttr * 100) }
    })

  const mttrZonaArr = mttrZonaMes as any[]
  const latestMes = mttrZonaArr.length ? [...new Set(mttrZonaArr.map((r: any) => r.mes))].sort().pop() : null
  const mttrZonaLatest = latestMes
    ? Object.fromEntries(mttrZonaArr.filter((r: any) => r.mes === latestMes).map((r: any) => [r.zona, r.mttr_avg]))
    : {}

  return NextResponse.json({
    totales: {
      total: Number(t0.total) || 0, mttrAvg: Number(t0.mttr_avg) || 0,
      slaPct: Number(t0.sla_pct) || 0, tiendas: Number(t0.tiendas) || 0,
      ieiTotal: Number(t0.iei_total) || 0,
      prevTotal: Number(t1.total) || 0, prevMttrAvg: Number(t1.mttr_avg) || 0,
    },
    byDay: byDay, byTipo: byTipo, mttrProveedor: mttrProv,
    slaProveedor: slaProv, topTiendas: topTiendas, reincidencia: reinc,
    byZona: byZona, slaTendencia: slaTend, mttrZonaMes: mttrZonaMes,
    costoProveedor, mttrZonaLatest,
  })
}
