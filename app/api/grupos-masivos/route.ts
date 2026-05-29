import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gruposMasivos, incidentes, tiendas, usuarios } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { razon, motivo, incidenteId } = body

  if (!razon?.trim()) return NextResponse.json({ error: 'Razón requerida' }, { status: 400 })

  const [user] = await db.select({ id: usuarios.id })
    .from(usuarios).where(eq(usuarios.email, session.user!.email!))
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // Generate short code: "GM-" + 5-digit sequence
  const [{ codigo }] = await db.execute<{ codigo: string }>(sql`
    SELECT 'GM-' || lpad(nextval('netdesk_inc_seq')::text, 5, '0') AS codigo
  `)

  const [grupo] = await db.insert(gruposMasivos).values({
    codigo,
    razon: razon.trim(),
    motivo: motivo?.trim() ?? null,
    creadoPorId: user.id,
  }).returning()

  // Link the originating incident if provided
  if (incidenteId) {
    await db.update(incidentes)
      .set({ grupoMasivoId: grupo.id })
      .where(eq(incidentes.id, incidenteId))
  }

  return NextResponse.json(grupo)
}
