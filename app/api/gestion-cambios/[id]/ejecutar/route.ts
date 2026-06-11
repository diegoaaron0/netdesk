import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  accionesGestion, accionesGestionTiendas,
  tiendas, tiendasHistorial, incidentes, fichas,
} from '@/drizzle/schema'
import { eq, and, isNull, ne, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const notasEjecucion: string = body.notasEjecucion?.trim() ?? ''
  const fichaNuevaId:   string | null = body.fichaNuevaId ?? null

  const [accion] = await db.select({
    id:                  accionesGestion.id,
    tipo:                accionesGestion.tipo,
    estado:              accionesGestion.estado,
    alcance:             accionesGestion.alcance,
    tiendaId:            accionesGestion.tiendaId,
    proveedorAnteriorId: accionesGestion.proveedorAnteriorId,
    proveedorNuevoId:    accionesGestion.proveedorNuevoId,
    titulo:              accionesGestion.titulo,
    codigo:              accionesGestion.codigo,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))

  if (!accion) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (accion.estado !== 'APROBADO')
    return NextResponse.json({ error: 'La acción debe estar APROBADA para ejecutarse' }, { status: 409 })

  const ejecutadoPorId = (session.user as any)?.id
  const ahora          = new Date()

  // Calcular fechas de evaluación
  const eval30 = new Date(ahora); eval30.setDate(eval30.getDate() + 30)
  const eval90 = new Date(ahora); eval90.setDate(eval90.getDate() + 90)
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10)

  // ── CAMBIO_PROVEEDOR: lógica específica ──────────────────────────────────────
  if (accion.tipo === 'CAMBIO_PROVEEDOR') {
    if (!accion.proveedorNuevoId)
      return NextResponse.json({ error: 'Falta proveedor nuevo' }, { status: 400 })

    if (accion.alcance === 'TIENDA') {
      if (!accion.tiendaId)
        return NextResponse.json({ error: 'Falta tienda' }, { status: 400 })

      // Bloquear si hay incidentes abiertos
      const [{ cnt }] = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM incidentes
        WHERE tienda_id = ${accion.tiendaId}
          AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      `) as any[]
      if (Number(cnt) > 0)
        return NextResponse.json({
          error: `La tienda tiene ${cnt} incidente${cnt > 1 ? 's' : ''} abierto${cnt > 1 ? 's' : ''}. Resuelve todos antes de ejecutar.`,
          incidentesAbiertos: cnt,
        }, { status: 409 })

      await _cambiarProveedorTienda(accion.tiendaId, accion.proveedorAnteriorId, accion.proveedorNuevoId, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)

    } else {
      // ZONA: iterar cada tienda del scope
      const tScope = await db.select().from(accionesGestionTiendas)
        .where(eq(accionesGestionTiendas.accionId, id))

      for (const row of tScope) {
        const [{ cnt }] = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt FROM incidentes
          WHERE tienda_id = ${row.tiendaId}
            AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
        `) as any[]
        if (Number(cnt) > 0) continue // omitir tiendas con incidentes abiertos (no bloquear toda la zona)

        const pAnterior = row.proveedorAnteriorId ?? accion.proveedorAnteriorId
        const pNuevo    = row.proveedorNuevoId    ?? accion.proveedorNuevoId
        await _cambiarProveedorTienda(row.tiendaId, pAnterior, pNuevo!, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)
        await db.update(accionesGestionTiendas).set({ ejecutada: true }).where(eq(accionesGestionTiendas.id, row.id))
      }
    }
  }

  // Activar la ficha nueva si se proporcionó
  let fichaAnteriorIdCapturada: string | null = null
  if (fichaNuevaId) {
    const [fichaData] = await db
      .select({
        id:                  fichas.id,
        tiendaId:            fichas.tiendaId,
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
      .where(eq(fichas.id, fichaNuevaId))
      .limit(1)

    if (fichaData) {
      // Capturar la ficha activa anterior ANTES de archivarla
      const [fichaAnterior] = await db.select({ id: fichas.id })
        .from(fichas)
        .where(and(
          eq(fichas.tiendaId, fichaData.tiendaId),
          eq(fichas.estado, 'ACTIVA'),
          ne(fichas.id, fichaNuevaId),
        ))
        .limit(1)
      fichaAnteriorIdCapturada = fichaAnterior?.id ?? null

      // Archivar ficha activa anterior (si la hay)
      if (fichaAnteriorIdCapturada) {
        await db.update(fichas)
          .set({ estado: 'HISTORICA', archivadoEn: ahora })
          .where(eq(fichas.id, fichaAnteriorIdCapturada))
      }

      // Activar la nueva ficha
      await db.update(fichas)
        .set({ estado: 'ACTIVA', activadoEn: ahora })
        .where(eq(fichas.id, fichaNuevaId))

      // Sincronizar campos de conectividad a la tienda
      const syncFields: Record<string, unknown> = { fichaActivaId: fichaNuevaId }
      const connFields = [
        'cidServicio', 'tipoConexion', 'velocidad', 'tipoServicio', 'costoMensual',
        'descripcionServicio', 'planAplicado', 'vigenciaContrato', 'estadoServicio', 'fechaAltaServicio',
      ] as const
      for (const f of connFields) {
        if (fichaData[f] != null) syncFields[f] = fichaData[f]
      }
      await db.update(tiendas).set(syncFields as any).where(eq(tiendas.id, fichaData.tiendaId))
    }
  }

  // Marcar como EJECUTADO
  const [updated] = await db.update(accionesGestion)
    .set({
      estado:         'EJECUTADO',
      ejecutadoEn:    ahora,
      ejecutadoPorId,
      notasEjecucion: notasEjecucion || null,
      fichaNuevaId:   fichaNuevaId ?? undefined,
      fichaAnteriorId: fichaAnteriorIdCapturada ?? undefined,
      fechaEval30:    toDateStr(eval30),
      fechaEval90:    toDateStr(eval90),
      actualizadoEn:  ahora,
    })
    .where(eq(accionesGestion.id, id))
    .returning()

  return NextResponse.json(updated)
}

async function _cambiarProveedorTienda(
  tiendaId: string,
  proveedorAnteriorId: string | null | undefined,
  proveedorNuevoId: string,
  usuarioId: string,
  referencia: string,
) {
  // Backfill: incidentes históricos sin proveedor_id explícito → atribuir al proveedor anterior
  // Esto preserva la historia aunque cambie tiendas.proveedor_id (evita que COALESCE los mueva)
  if (proveedorAnteriorId) {
    await db.update(incidentes)
      .set({ proveedorId: proveedorAnteriorId } as any)
      .where(and(
        eq(incidentes.tiendaId, tiendaId),
        isNull((incidentes as any).proveedorId),
      ))
  }

  // Actualizar proveedor de la tienda
  await db.update(tiendas)
    .set({ proveedorId: proveedorNuevoId } as any)
    .where(eq(tiendas.id, tiendaId))

  // Auditoría
  await db.insert(tiendasHistorial).values({
    tiendaId,
    usuarioId,
    campoEditado:  'proveedor_id',
    valorAnterior: proveedorAnteriorId ?? null,
    valorNuevo:    `${proveedorNuevoId} — vía ${referencia}`,
  })
}
