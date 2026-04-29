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

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.tipo,
      i.estado,
      i.impacto,
      t.codigo AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      t.distrito,
      p.nombre AS proveedor,
      u.nombre AS agente,
      TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS hora_registro,
      TO_CHAR(i.hora_fin AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS hora_fin,
      i.mttr_minutos,
      i.ticket_invgate
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    JOIN proveedores p ON t.proveedor_id = p.id
    LEFT JOIN usuarios u ON i.agente_id = u.id
    WHERE i.hora_registro >= ${desde}::timestamptz AND i.hora_registro < ${hasta}::timestamptz
    ORDER BY i.hora_registro DESC
  `)

  const headers = [
    'ID', 'Tipo', 'Estado', 'Impacto',
    'Tienda Código', 'Tienda Nombre', 'Distrito', 'Proveedor',
    'Agente', 'Hora Registro', 'Hora Fin', 'MTTR (min)', 'Ticket Invgate',
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
        r.id, r.tipo, r.estado, r.impacto,
        r.tienda_codigo, r.tienda_nombre, r.distrito, r.proveedor,
        r.agente, r.hora_registro, r.hora_fin, r.mttr_minutos, r.ticket_invgate,
      ].map(escape).join(',')
    ),
  ]

  const csv = '﻿' + lines.join('\r\n') // BOM for Excel UTF-8

  const desdeLabel = new Date(desde).toISOString().slice(0, 10)
  const hastaLabel = new Date(hasta).toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="incidentes_${desdeLabel}_${hastaLabel}.csv"`,
    },
  })
}
