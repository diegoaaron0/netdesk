import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contingencias, usuarios } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await db.select({
    id:                contingencias.id,
    tipo:              contingencias.tipo,
    activadoPor:       contingencias.activadoPor,
    horaActivacion:    contingencias.horaActivacion,
    horaDesactivacion: contingencias.horaDesactivacion,
    justificacion:     contingencias.justificacion,
    creadoEn:          contingencias.creadoEn,
    usuarioNombre:     usuarios.nombre,
  })
    .from(contingencias)
    .leftJoin(usuarios, eq(contingencias.usuarioId, usuarios.id))
    .where(eq(contingencias.tiendaId, id))
    .orderBy(desc(contingencias.horaActivacion))

  return NextResponse.json(rows)
}
