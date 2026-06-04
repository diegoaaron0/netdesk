import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { ieiPerRow, pgErrMsg } from '@/lib/report-sql'

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

    const rows = await db.execute(sql`
      WITH base AS (
        SELECT
          i.tienda_id,
          t.codigo,
          t.nombre_cc,
          t.distrito,
          COALESCE(pi.nombre, pt.nombre)          AS proveedor,
          i.tipo,
          i.mttr_minutos,
          i.hora_registro,
          COALESCE(t.tiene_contingencia, false)   AS tiene_contingencia,
          ${sql.raw(ieiPerRow())}                                                        AS iei_row
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
        WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
          AND i.estado != 'CANCELADO'
      ),
      lagged AS (
        SELECT tienda_id,
          EXTRACT(EPOCH FROM (hora_registro -
            LAG(hora_registro) OVER (PARTITION BY tienda_id ORDER BY hora_registro)
          )) / 86400.0 AS dias_diff
        FROM base
      ),
      gaps AS (
        SELECT tienda_id, AVG(dias_diff) AS avg_dias
        FROM lagged
        WHERE dias_diff IS NOT NULL
        GROUP BY tienda_id
      ),
      agg AS (
        SELECT
          b.tienda_id,
          MAX(b.codigo)                                    AS codigo,
          MAX(b.nombre_cc)                                 AS nombre_cc,
          MAX(b.distrito)                                  AS distrito,
          MODE() WITHIN GROUP (ORDER BY b.proveedor)       AS proveedor,
          COUNT(*)::int                                    AS incidentes,
          MODE() WITHIN GROUP (ORDER BY b.tipo)            AS tipo_frecuente,
          ROUND(AVG(b.mttr_minutos))::int                  AS mttr_avg,
          ROUND(MAX(g.avg_dias)::numeric, 1)               AS dias_entre_caidas,
          ROUND(SUM(b.iei_row))::int                       AS iei_acumulado,
          BOOL_OR(b.tiene_contingencia)                    AS contingencia
        FROM base b
        LEFT JOIN gaps g ON g.tienda_id = b.tienda_id
        GROUP BY b.tienda_id
        HAVING COUNT(*) >= 2
      )
      SELECT * FROM agg ORDER BY incidentes DESC
    `)

    const CRLF = '\r\n'
    const headers = row('#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Incidentes',
      'Tipo más frecuente', 'MTTR prom (min)', 'Días prom entre caídas', 'IEI acumulado (S/)', 'Contingencia (Sí/No)')
    const dataRows = (rows as any[]).map((r, idx) =>
      row(idx + 1, r.codigo, r.nombre_cc ?? '', r.distrito ?? '', r.proveedor ?? '',
        r.incidentes, r.tipo_frecuente ?? '', r.mttr_avg ?? '',
        r.dias_entre_caidas != null ? r.dias_entre_caidas : '',
        r.iei_acumulado ?? 0, r.contingencia ? 'Sí' : 'No')
    )

    const csv = '﻿' + [headers, ...dataRows].join(CRLF)
    const desdeLabel = desde.slice(0, 10)
    const hastaLabel = hasta.slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_tiendas_criticas_${desdeLabel}_${hastaLabel}.csv"`,
      },
    })
  } catch (err: unknown) {
    console.error('[export/tiendas-criticas]', (err as any)?.cause ?? err)
    return NextResponse.json({ error: pgErrMsg(err) }, { status: 500 })
  }
}
