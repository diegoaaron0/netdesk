import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, fichasNiveles, proveedoresNiveles } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [nivelFicha] = await db.select().from(fichasNiveles)
    .where(and(eq(fichasNiveles.id, nivelId), eq(fichasNiveles.fichaId, id))).limit(1)
  if (!nivelFicha) return NextResponse.json({ error: 'Nivel no encontrado' }, { status: 404 })

  const [ficha] = await db.select({ proveedorId: fichas.proveedorId }).from(fichas).where(eq(fichas.id, id)).limit(1)
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 })

  const [nivelMolde] = await db.select().from(proveedoresNiveles)
    .where(and(eq(proveedoresNiveles.proveedorId, ficha.proveedorId), eq(proveedoresNiveles.nivel, nivelFicha.nivel))).limit(1)
  if (!nivelMolde) {
    return NextResponse.json({ error: `El proveedor no tiene un nivel N${nivelFicha.nivel} en su molde` }, { status: 404 })
  }

  // "Volver a seguir la plantilla": sobreescribe con los valores actuales del
  // molde y lo vuelve a marcar como sincronizado (personalizado=false), para
  // que reciba futuras propagaciones automáticamente.
  const [updated] = await db.update(fichasNiveles).set({
    nombreContacto:         nivelMolde.nombreContacto,
    email:                  nivelMolde.email,
    celular:                nivelMolde.celular,
    tiempoRespSev1:         nivelMolde.tiempoRespSev1,
    tiempoRespSev2:         nivelMolde.tiempoRespSev2,
    tiempoRespSev3:         nivelMolde.tiempoRespSev3,
    correosCopia:           nivelMolde.correosCopia,
    whatsapp:               nivelMolde.whatsapp,
    canal:                  nivelMolde.canal,
    horarioAtencion:        nivelMolde.horarioAtencion,
    tiempoEsperadoSolucion: nivelMolde.tiempoEsperadoSolucion,
    instruccion:            nivelMolde.instruccion,
    activo:                 nivelMolde.activo,
    personalizado:          false,
  }).where(eq(fichasNiveles.id, nivelId)).returning()

  return NextResponse.json(updated)
}
