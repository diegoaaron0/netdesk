import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.estado,
      i.mttr_minutos,
      i.hora_registro,
      i.hora_fin
    FROM incidentes i
    WHERE i.tienda_id = ${id}
      AND i.estado != 'CANCELADO'
    ORDER BY i.hora_registro DESC
    LIMIT 10
  `)

  return NextResponse.json(rows)
}
