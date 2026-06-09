import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contingencias, tiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [updated] = await db.update(contingencias)
    .set({ horaDesactivacion: new Date() })
    .where(eq(contingencias.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Limpiar contingencia_activa si no quedan otras fuentes activas
  const [incRows] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int AS cnt FROM incidentes
    WHERE tienda_id = ${updated.tiendaId}
      AND cont_activado_por IS NOT NULL
      AND cont_hora_desactivacion IS NULL
      AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
  `)
  const [contRows] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int AS cnt FROM contingencias
    WHERE tienda_id = ${updated.tiendaId}
      AND hora_desactivacion IS NULL
      AND id != ${id}
  `)
  const stillActive = Number((incRows as any).cnt ?? 0) + Number((contRows as any).cnt ?? 0)
  if (stillActive === 0) {
    await db.update(tiendas)
      .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
      .where(eq(tiendas.id, updated.tiendaId))
  }

  return NextResponse.json(updated)
}
