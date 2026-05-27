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

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const rows = await db.execute(sql`
      SELECT
        t.codigo,
        t.nombre_cc,
        t.distrito,
        t.provincia,
        COALESCE(p.nombre, '')              AS proveedor,
        t.cid_servicio,
        t.tipo_conexion,
        t.cluster,
        CASE WHEN COALESCE(t.tiene_contingencia, false) THEN 'Sí' ELSE 'No' END AS tiene_contingencia,
        t.venta_hora_soles
      FROM tiendas t
      LEFT JOIN proveedores p ON t.proveedor_id = p.id
      ORDER BY
        CASE
          WHEN t.codigo ~* '-C$'
            OR t.nombre_cc ILIKE '%catalogo%'
            OR t.formato   ILIKE '%catalogo%'
            OR t.distrito  ILIKE '%catalogo%'
          THEN 1 ELSE 0
        END,
        t.codigo
    `)

    const headers = [
      'Código', 'Nombre CC', 'Distrito', 'Provincia', 'Proveedor',
      'CID', 'Tipo Conexión', 'Cluster', 'Contingencia', 'Venta/Hora (S/)',
    ]

    const CRLF = '\r\n'
    const lines = [
      headers.join(','),
      ...(rows as any[]).map(r => [
        r.codigo, r.nombre_cc ?? '', r.distrito ?? '', r.provincia ?? '', r.proveedor,
        r.cid_servicio ?? '', r.tipo_conexion ?? '', r.cluster ?? '',
        r.tiene_contingencia, r.venta_hora_soles ?? '',
      ].map(esc).join(',')),
    ]

    const csv = '﻿' + lines.join(CRLF)
    const fecha = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_maestro_tiendas_${fecha}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('[tiendas/export]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
