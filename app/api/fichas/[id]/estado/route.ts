import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, tiendas, incidentes, tiendasHistorial } from '@/drizzle/schema'
import { eq, and, ne, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// PATCH /api/fichas/[id]/estado
// body: { estado: 'BORRADOR' | 'ACTIVA' | 'HISTORICA' | 'DADA_DE_BAJA' }
// Activar: archiva la ficha ACTIVA anterior de la tienda y sincroniza tiendas.*
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { estado } = await req.json()
  if (!['BORRADOR', 'ACTIVA', 'HISTORICA', 'DADA_DE_BAJA'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const [ficha] = await db
    .select({
      id:          fichas.id,
      codigo:      fichas.codigo,
      tiendaId:    fichas.tiendaId,
      proveedorId: fichas.proveedorId,
      estado:      fichas.estado,
    })
    .from(fichas)
    .where(eq(fichas.id, id))
    .limit(1)

  if (!ficha) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (ficha.estado === estado) return NextResponse.json({ error: 'La ficha ya tiene ese estado' }, { status: 400 })

  // Gobierno: la activación directa solo se permite como ALTA INICIAL (la tienda aún no
  // tiene ficha activa). Si ya tiene una, el reemplazo va por Gestión de Cambios.
  if (estado === 'ACTIVA') {
    const [t] = await db.select({ fichaActivaId: tiendas.fichaActivaId })
      .from(tiendas).where(eq(tiendas.id, ficha.tiendaId)).limit(1)
    if (t?.fichaActivaId && t.fichaActivaId !== id)
      return NextResponse.json({ error: 'La tienda ya tiene una ficha activa. El reemplazo se realiza por Gestión de Cambios.' }, { status: 409 })
  }
  // El archivado directo no está permitido: ocurre al activar un reemplazo vía Gestión de Cambios.
  if (estado === 'HISTORICA')
    return NextResponse.json({ error: 'Archivar una ficha se hace activando su reemplazo por Gestión de Cambios.' }, { status: 409 })
  // La baja tampoco es directa: ocurre al ejecutar una acción de tipo "Dar de Baja" en Gestión de Cambios.
  if (estado === 'DADA_DE_BAJA')
    return NextResponse.json({ error: 'Dar de baja una ficha se hace por Gestión de Cambios.' }, { status: 409 })

  if (estado === 'ACTIVA') {
    // Leer el proveedor actual de la tienda ANTES de sincronizar
    const [tiendaActual] = await db
      .select({ proveedorId: tiendas.proveedorId })
      .from(tiendas)
      .where(eq(tiendas.id, ficha.tiendaId))
      .limit(1)

    const proveedorAnteriorId = tiendaActual?.proveedorId ?? null

    // Archivar la ficha ACTIVA anterior de esta tienda (que no sea la que estamos activando)
    await db
      .update(fichas)
      .set({ estado: 'HISTORICA', archivadoEn: new Date() })
      .where(and(
        eq(fichas.tiendaId, ficha.tiendaId),
        eq(fichas.estado, 'ACTIVA'),
        ne(fichas.id, id),
      ))

    // Activar la nueva ficha
    const [updated] = await db
      .update(fichas)
      .set({ estado: 'ACTIVA', activadoEn: new Date() })
      .where(eq(fichas.id, id))
      .returning()

    // Sincronizar tienda: solo puntero a ficha activa y proveedor
    await db.update(tiendas)
      .set({ fichaActivaId: id, proveedorId: ficha.proveedorId })
      .where(eq(tiendas.id, ficha.tiendaId))

    // Si el proveedor cambió (activación directa sin pasar por ejecutar),
    // garantizar backfill de incidentes e historial.
    // Nota: si ejecutar ya corrió primero, tiendas.proveedorId ya tiene el nuevo valor
    // así que esta condición es false y no se duplica nada.
    if (ficha.proveedorId && proveedorAnteriorId && ficha.proveedorId !== proveedorAnteriorId) {
      // Backfill: incidentes históricos sin proveedor explícito → atribuir al proveedor anterior
      await db.update(incidentes)
        .set({ proveedorId: proveedorAnteriorId } as any)
        .where(and(
          eq(incidentes.tiendaId, ficha.tiendaId),
          isNull((incidentes as any).proveedorId),
        ))

      await db.insert(tiendasHistorial).values({
        tiendaId:      ficha.tiendaId,
        usuarioId:     (session.user as any).id ?? null,
        campoEditado:  'proveedor_id',
        valorAnterior: proveedorAnteriorId,
        valorNuevo:    `${ficha.proveedorId} — vía ficha ${ficha.codigo ?? id}`,
      })
    }

    return NextResponse.json(updated)
  }

  if (estado === 'HISTORICA') {
    const [updated] = await db
      .update(fichas)
      .set({ estado: 'HISTORICA', archivadoEn: new Date() })
      .where(eq(fichas.id, id))
      .returning()

    // Si era la activa de la tienda, limpiar el puntero
    await db
      .update(tiendas)
      .set({ fichaActivaId: null })
      .where(and(eq(tiendas.id, ficha.tiendaId), eq(tiendas.fichaActivaId, id)))

    return NextResponse.json(updated)
  }

  // BORRADOR
  const [updated] = await db
    .update(fichas)
    .set({ estado: 'BORRADOR', activadoEn: null })
    .where(eq(fichas.id, id))
    .returning()

  return NextResponse.json(updated)
}
