import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, tiendas, incidentes, tiendasHistorial } from '@/drizzle/schema'
import { eq, and, ne, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// PATCH /api/fichas/[id]/estado
// body: { estado: 'BORRADOR' | 'ACTIVA' | 'HISTORICA' }
// Activar: archiva la ficha ACTIVA anterior de la tienda y sincroniza tiendas.*
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { estado } = await req.json()
  if (!['BORRADOR', 'ACTIVA', 'HISTORICA'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const [ficha] = await db
    .select({
      id:                  fichas.id,
      codigo:              fichas.codigo,
      tiendaId:            fichas.tiendaId,
      proveedorId:         fichas.proveedorId,
      estado:              fichas.estado,
      cidServicio:         fichas.cidServicio,
      tipoConexion:        fichas.tipoConexion,
      velocidad:           fichas.velocidad,
      tipoServicio:        fichas.tipoServicio,
      costoMensual:        fichas.costoMensual,
      descripcionServicio: fichas.descripcionServicio,
      planAplicado:        fichas.planAplicado,
      vigenciaContrato:    fichas.vigenciaContrato,
      estadoServicio:      fichas.estadoServicio,
      fechaAltaServicio:   fichas.fechaAltaServicio,
    })
    .from(fichas)
    .where(eq(fichas.id, id))
    .limit(1)

  if (!ficha) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (ficha.estado === estado) return NextResponse.json({ error: 'La ficha ya tiene ese estado' }, { status: 400 })

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

    // Sincronizar tienda: ficha activa + todos los campos de conectividad
    const syncFields: Record<string, unknown> = { fichaActivaId: id, proveedorId: ficha.proveedorId }
    const connFields: (keyof typeof ficha)[] = [
      'cidServicio', 'tipoConexion', 'velocidad', 'tipoServicio', 'costoMensual',
      'descripcionServicio', 'planAplicado', 'vigenciaContrato', 'estadoServicio', 'fechaAltaServicio',
    ]
    for (const f of connFields) {
      if (ficha[f] != null) syncFields[f] = ficha[f]
    }
    await db.update(tiendas).set(syncFields as any).where(eq(tiendas.id, ficha.tiendaId))

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
