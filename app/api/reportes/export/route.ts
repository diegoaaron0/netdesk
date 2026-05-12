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
  const desde  = searchParams.get('desde') ?? new Date(Date.now() - 30 * 86400000).toISOString()
  const hasta  = searchParams.get('hasta') ?? new Date().toISOString()
  const estado = searchParams.get('estado') ?? ''

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.estado,
      i.nivel_impacto,
      t.codigo AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      t.distrito,
      COALESCE(pi.nombre, pt.nombre) AS proveedor,
      u.nombre AS agente,
      TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS hora_registro,
      TO_CHAR(i.hora_fin     AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS hora_fin,
      i.mttr_minutos,
      i.ticket_invgate,
      i.ticket_proveedor
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores pi ON i.proveedor_id  = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN usuarios u ON i.registrado_por_id = u.id
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      ${estado ? sql`AND i.estado = ${estado}` : sql``}
    ORDER BY i.hora_registro DESC
  `)

  const headers = [
    'ID', 'Código', 'Tipo', 'Estado', 'Impacto',
    'Tienda Código', 'Tienda Nombre', 'Distrito', 'Proveedor',
    'Agente', 'Hora Registro', 'Hora Fin', 'MTTR (min)', 'Ticket InvGate', 'Ticket Proveedor',
  ]

  const escape = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [
    headers.join(','),
    ...(rows as any[]).map(r =>
      [
        r.id, r.codigo, r.tipo, r.estado, r.nivel_impacto,
        r.tienda_codigo, r.tienda_nombre, r.distrito, r.proveedor,
        r.agente, r.hora_registro, r.hora_fin, r.mttr_minutos, r.ticket_invgate, r.ticket_proveedor,
      ].map(escape).join(',')
    ),
  ]

  const csv = '﻿' + lines.join('\r\n') // BOM for Excel UTF-8

  const desdeLabel = new Date(desde).toISOString().slice(0, 10)
  const hastaLabel = new Date(hasta).toISOString().slice(0, 10)
  const sufijo     = estado ? `_${estado.toLowerCase()}` : ''

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="netdesk_incidentes${sufijo}_${desdeLabel}_${hastaLabel}.csv"`,
    },
  })
}
