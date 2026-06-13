import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : '1970-01-01T00:00:00Z'

  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.tipo,
      c.activado_por,
      c.hora_activacion,
      c.hora_desactivacion,
      c.justificacion,
      c.creado_en,
      u.nombre AS usuario_nombre
    FROM contingencias c
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE c.tienda_id = ${id}
      AND c.hora_activacion >= ${desde}::timestamptz
      AND c.hora_activacion <  ${hasta}::timestamptz
    ORDER BY c.hora_activacion DESC
  `)

  return NextResponse.json(
    (rows as any[]).map(r => ({
      id:                r.id,
      tipo:              r.tipo,
      activadoPor:       r.activado_por,
      horaActivacion:    r.hora_activacion,
      horaDesactivacion: r.hora_desactivacion,
      justificacion:     r.justificacion,
      creadoEn:          r.creado_en,
      usuarioNombre:     r.usuario_nombre,
    }))
  )
}
