import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, usuarios } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const data = await db.select({
    id:           incidentes.id,
    codigo:       incidentes.codigo,
    tipo:         incidentes.tipo,
    estado:       incidentes.estado,
    horaRegistro: incidentes.horaRegistro,
    horaFin:      incidentes.horaFin,
    mttrMinutos:  incidentes.mttrMinutos,
    agenteName:   usuarios.nombre,
  })
    .from(incidentes)
    .leftJoin(usuarios, eq(incidentes.registradoPorId, usuarios.id))
    .where(eq(incidentes.tiendaId, id))
    .orderBy(desc(incidentes.horaRegistro))
    .limit(5)

  return NextResponse.json(data)
}
