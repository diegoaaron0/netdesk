import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await db.select({
    id:          incidentes.id,
    codigo:      incidentes.codigo,
    tipo:        incidentes.tipo,
    estado:      incidentes.estado,
    mttrMinutos: incidentes.mttrMinutos,
    resueltoPor: incidentes.resueltoPor,
    horaFin:     incidentes.horaFin,
    tiendaId:    incidentes.tiendaId,
    tiendaCodigo: tiendas.codigo,
    tiendaNombre: tiendas.nombreCc,
  })
    .from(incidentes)
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .where(eq(incidentes.registradoPorId, id))
    .orderBy(desc(incidentes.horaFin))
    .limit(50)

  return NextResponse.json(rows)
}
