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
      SELECT
        i.codigo,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'DD/MM/YYYY')  AS fecha,
        t.codigo                                                              AS tienda_codigo,
        t.nombre_cc                                                           AS tienda_nombre_cc,
        t.distrito,
        COALESCE(pi.nombre, pt.nombre)                                        AS proveedor,
        i.tipo                                                                AS tipo_incidente,
        TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'HH24:MI')      AS hora_inicio,
        TO_CHAR(i.hora_fin     AT TIME ZONE 'America/Lima', 'HH24:MI')       AS hora_resolucion,
        i.mttr_minutos                                                        AS mttr_min,
        CASE i.tipo
          WHEN 'CAIDA_TOTAL'   THEN 60
          WHEN 'INTERMITENCIA' THEN 120
          WHEN 'LENTITUD'      THEN 240
          WHEN 'POS'           THEN 60
          ELSE 120
        END                                                                   AS limite_sla,
        i.mttr_minutos - CASE i.tipo
          WHEN 'CAIDA_TOTAL'   THEN 60
          WHEN 'INTERMITENCIA' THEN 120
          WHEN 'LENTITUD'      THEN 240
          WHEN 'POS'           THEN 60
          ELSE 120
        END                                                                   AS exceso_min,
        CASE
          WHEN n2.tiene_n2 THEN 'Nivel 1 sin respuesta'
          WHEN n1.t_resp_min > 60 THEN 'Respuesta N1 tardía'
          ELSE 'Resolución tardía'
        END                                                                   AS motivo
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      LEFT JOIN LATERAL (
        SELECT
          EXTRACT(EPOCH FROM (MIN(e.hora_respuesta) - MIN(e.hora_envio_correo))) / 60 AS t_resp_min
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel = 1
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) > 0 AS tiene_n2
        FROM escalamientos e
        WHERE e.incidente_id = i.id AND e.nivel >= 2
      ) n2 ON true
      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.evaluable_proveedor IS NOT FALSE
        AND i.mttr_minutos > CASE i.tipo
          WHEN 'CAIDA_TOTAL'   THEN 60
          WHEN 'INTERMITENCIA' THEN 120
          WHEN 'LENTITUD'      THEN 240
          WHEN 'POS'           THEN 60
          ELSE 120
        END
      ORDER BY i.hora_registro DESC
    `)

    const CRLF = '\r\n'
    const headers = row('Código', 'Fecha', 'Código Tienda', 'Nombre CC', 'Distrito', 'Proveedor',
      'Tipo incidente', 'Hora inicio', 'Hora resolución', 'MTTR (min)', 'Límite SLA (min)', 'Exceso (min)', 'Motivo')
    const dataRows = (rows as any[]).map(r =>
      row(r.codigo, r.fecha, r.tienda_codigo, r.tienda_nombre_cc ?? '', r.distrito ?? '',
        r.proveedor ?? '', r.tipo_incidente, r.hora_inicio, r.hora_resolucion ?? '',
        r.mttr_min, r.limite_sla, r.exceso_min, r.motivo)
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
  } catch (err: any) {
    console.error('[export/fuera-sla]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
