import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cortesElectricos, tiendas, usuarios } from '@/drizzle/schema'
import { eq, desc, and, gte, lt, sql } from 'drizzle-orm'
import { auth } from '@/auth'

function limaDateRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, d,     5, 0, 0, 0)),
    end:   new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0, 0)),
  }
}

function limaToday(): string {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const fechaDesde = searchParams.get('fechaDesde') ?? '2020-01-01'
  const fechaHasta = searchParams.get('fechaHasta') ?? limaToday()
  const tiendaId   = searchParams.get('tiendaId')

  const { start } = limaDateRange(fechaDesde)
  const { end }   = limaDateRange(fechaHasta)

  const conds: any[] = [
    gte(cortesElectricos.horaInicio, start),
    lt(cortesElectricos.horaInicio, end),
  ]
  if (tiendaId) conds.push(eq(cortesElectricos.tiendaId, tiendaId))

  const rows = await db
    .select({
      id:              cortesElectricos.id,
      horaInicio:      cortesElectricos.horaInicio,
      horaFin:         cortesElectricos.horaFin,
      alcance:         cortesElectricos.alcance,
      tuvoUps:         cortesElectricos.tuvoUps,
      afectoRed:       cortesElectricos.afectoRed,
      observaciones:   cortesElectricos.observaciones,
      creadoEn:        cortesElectricos.creadoEn,
      tiendaId:        tiendas.id,
      tiendaCodigo:    tiendas.codigo,
      tiendaNombre:    tiendas.nombreCc,
      tiendaDistrito:  tiendas.distrito,
      registradoPorNombre: usuarios.nombre,
      duracionMinutos: sql<number | null>`
        CASE WHEN ${cortesElectricos.horaFin} IS NOT NULL
          THEN EXTRACT(EPOCH FROM (${cortesElectricos.horaFin} - ${cortesElectricos.horaInicio}))::int / 60
          ELSE NULL
        END
      `,
    })
    .from(cortesElectricos)
    .leftJoin(tiendas,   eq(cortesElectricos.tiendaId,        tiendas.id))
    .leftJoin(usuarios,  eq(cortesElectricos.registradoPorId, usuarios.id))
    .where(and(...conds))
    .orderBy(desc(cortesElectricos.horaInicio))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  const [user] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, session.user!.email!))
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const [row] = await db.insert(cortesElectricos).values({
    tiendaId:        body.tiendaId,
    registradoPorId: user.id,
    horaInicio:      new Date(body.horaInicio),
    horaFin:         body.horaFin ? new Date(body.horaFin) : null,
    alcance:         body.alcance ?? 'SOLO_TIENDA',
    tuvoUps:         body.tuvoUps ?? false,
    afectoRed:       body.afectoRed ?? false,
    observaciones:   body.observaciones ?? null,
  }).returning()

  return NextResponse.json(row, { status: 201 })
}
