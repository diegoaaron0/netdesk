import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, tiendas } from '@/drizzle/schema'
import { eq, and, ne } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// PATCH /api/fichas/[id]/estado
// body: { estado: 'BORRADOR' | 'ACTIVA' | 'HISTORICA' }
// Activar: archiva la ficha ACTIVA anterior de la tienda y sincroniza tiendas.*
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { estado } = await req.json()
  if (!['BORRADOR', 'ACTIVA', 'HISTORICA'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const [ficha] = await db
    .select({
      id:           fichas.id,
      tiendaId:     fichas.tiendaId,
      proveedorId:  fichas.proveedorId,
      estado:       fichas.estado,
      cidServicio:  fichas.cidServicio,
      tipoConexion: fichas.tipoConexion,
    })
    .from(fichas)
    .where(eq(fichas.id, params.id))
    .limit(1)

  if (!ficha) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (ficha.estado === estado) return NextResponse.json({ error: 'La ficha ya tiene ese estado' }, { status: 400 })

  if (estado === 'ACTIVA') {
    // Archivar la ficha ACTIVA anterior de esta tienda (que no sea la que estamos activando)
    await db
      .update(fichas)
      .set({ estado: 'HISTORICA', archivadoEn: new Date() })
      .where(and(
        eq(fichas.tiendaId, ficha.tiendaId),
        eq(fichas.estado, 'ACTIVA'),
        ne(fichas.id, params.id),
      ))

    // Activar la nueva ficha
    const [updated] = await db
      .update(fichas)
      .set({ estado: 'ACTIVA', activadoEn: new Date() })
      .where(eq(fichas.id, params.id))
      .returning()

    // Sincronizar tienda: apuntar a la nueva ficha y actualizar datos de conectividad
    const syncFields: Record<string, unknown> = { fichaActivaId: params.id, proveedorId: ficha.proveedorId }
    if (ficha.cidServicio)  syncFields.cidServicio  = ficha.cidServicio
    if (ficha.tipoConexion) syncFields.tipoConexion = ficha.tipoConexion

    await db.update(tiendas).set(syncFields as any).where(eq(tiendas.id, ficha.tiendaId))

    return NextResponse.json(updated)
  }

  if (estado === 'HISTORICA') {
    const [updated] = await db
      .update(fichas)
      .set({ estado: 'HISTORICA', archivadoEn: new Date() })
      .where(eq(fichas.id, params.id))
      .returning()

    // Si era la activa de la tienda, limpiar el puntero
    await db
      .update(tiendas)
      .set({ fichaActivaId: null })
      .where(and(eq(tiendas.id, ficha.tiendaId), eq(tiendas.fichaActivaId, params.id)))

    return NextResponse.json(updated)
  }

  // BORRADOR
  const [updated] = await db
    .update(fichas)
    .set({ estado: 'BORRADOR', activadoEn: null })
    .where(eq(fichas.id, params.id))
    .returning()

  return NextResponse.json(updated)
}
