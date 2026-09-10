import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, asc } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

/**
 * Fase 4 — endpoint de solo lectura para el "Desglose por tramos" del panel
 * de detalle. Simple: SELECT ordenado por desde, sin cálculos — el tramo
 * abierto (hasta=null) viene con ie_tramo=null, el cliente calcula su IEI
 * en vivo (misma lógica que ya usa el resto de la página).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const tramos = await db.select().from(incidenteMitigacionTramos)
    .where(eq(incidenteMitigacionTramos.incidenteId, id))
    .orderBy(asc(incidenteMitigacionTramos.desde))

  return NextResponse.json(tramos)
}
