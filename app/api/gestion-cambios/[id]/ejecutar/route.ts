import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  accionesGestion, accionesGestionTiendas,
  tiendas, tiendasHistorial, incidentes, fichas,
} from '@/drizzle/schema'
import { eq, and, isNull, ne, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// Error con código HTTP para abortar (y revertir) la transacción con un mensaje claro
class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Ejecutar: lo puede hacer quien crea (infra/supervisor) o quien aprueba (supervisor/gerencia).
  // El guard de estado (APROBADO) garantiza que nada se ejecute sin aprobación previa.
  if (!can(session, 'gestion-cambios.crear') && !can(session, 'gestion-cambios.aprobar'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const notasEjecucion: string = body.notasEjecucion?.trim() ?? ''

  const [accion] = await db.select({
    id:                  accionesGestion.id,
    tipo:                accionesGestion.tipo,
    estado:              accionesGestion.estado,
    alcance:             accionesGestion.alcance,
    tiendaId:            accionesGestion.tiendaId,
    proveedorAnteriorId: accionesGestion.proveedorAnteriorId,
    proveedorNuevoId:    accionesGestion.proveedorNuevoId,
    fichaNuevaId:        accionesGestion.fichaNuevaId,
    titulo:              accionesGestion.titulo,
    codigo:              accionesGestion.codigo,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))

  if (!accion) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (accion.estado !== 'APROBADO')
    return NextResponse.json({ error: 'La acción debe estar APROBADA para ejecutarse' }, { status: 409 })

  // La ficha se adjunta al PROPONER. En los tipos que generan ficha es obligatoria: no se ejecuta sin ella.
  const TIPOS_CON_FICHA = ['CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTUALIZACION_PLAN']
  const fichaNuevaId: string | null = accion.fichaNuevaId ?? null
  if (TIPOS_CON_FICHA.includes(accion.tipo) && !fichaNuevaId)
    return NextResponse.json({ error: 'La acción no tiene ficha adjunta. Vuelve a proponerla adjuntando la ficha.' }, { status: 409 })

  // Re-validar la ficha al EJECUTAR (por si la editaron/activaron entre proponer y ejecutar)
  if (fichaNuevaId) {
    const proveedorObjetivo = accion.proveedorNuevoId ?? accion.proveedorAnteriorId
    const [f] = await db.select({ tiendaId: fichas.tiendaId, proveedorId: fichas.proveedorId, estado: fichas.estado })
      .from(fichas).where(eq(fichas.id, fichaNuevaId)).limit(1)
    if (!f)
      return NextResponse.json({ error: 'La ficha adjunta ya no existe' }, { status: 409 })
    if (f.tiendaId !== accion.tiendaId)
      return NextResponse.json({ error: 'La ficha adjunta no pertenece a la tienda de la acción' }, { status: 409 })
    if (proveedorObjetivo && f.proveedorId !== proveedorObjetivo)
      return NextResponse.json({ error: 'La ficha adjunta ya no corresponde al proveedor de la acción' }, { status: 409 })
    if (f.estado !== 'BORRADOR')
      return NextResponse.json({ error: 'La ficha adjunta ya no está en BORRADOR' }, { status: 409 })
  }

  const ejecutadoPorId = (session.user as any)?.id
  const ahora          = new Date()

  // Fechas de evaluación (opcionales, no cambian el estado): fecha CALENDARIO en Lima + 30/90 días.
  // (Usar UTC correría el día cerca de medianoche.)
  const limaDateStr = (base: Date, plusDays: number) => {
    const lima = new Date(base.toLocaleString('en-US', { timeZone: 'America/Lima' }))
    lima.setDate(lima.getDate() + plusDays)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${lima.getFullYear()}-${p(lima.getMonth() + 1)}-${p(lima.getDate())}`
  }

  try {
    // Toda la ejecución es atómica: o se aplica completa, o no se aplica nada.
    const updated = await db.transaction(async (tx) => {
      // ── CAMBIO_PROVEEDOR: lógica específica ──────────────────────────────────
      if (accion.tipo === 'CAMBIO_PROVEEDOR') {
        if (!accion.proveedorNuevoId)
          throw new HttpError(400, 'Falta proveedor nuevo')

        if (accion.alcance === 'TIENDA') {
          if (!accion.tiendaId)
            throw new HttpError(400, 'Falta tienda')

          // Bloquear si hay incidentes abiertos
          const [{ cnt }] = await tx.execute(sql`
            SELECT COUNT(*)::int AS cnt FROM incidentes
            WHERE tienda_id = ${accion.tiendaId}
              AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
          `) as any[]
          if (Number(cnt) > 0)
            throw new HttpError(409,
              `La tienda tiene ${cnt} incidente${Number(cnt) > 1 ? 's' : ''} abierto${Number(cnt) > 1 ? 's' : ''}. Resuelve todos antes de ejecutar.`,
              { incidentesAbiertos: Number(cnt) })

          await _cambiarProveedorTienda(tx, accion.tiendaId, accion.proveedorAnteriorId, accion.proveedorNuevoId, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)

        } else {
          // ZONA: iterar cada tienda del scope
          const tScope = await tx.select().from(accionesGestionTiendas)
            .where(eq(accionesGestionTiendas.accionId, id))

          for (const row of tScope) {
            const [{ cnt }] = await tx.execute(sql`
              SELECT COUNT(*)::int AS cnt FROM incidentes
              WHERE tienda_id = ${row.tiendaId}
                AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
            `) as any[]
            if (Number(cnt) > 0) continue // omitir tiendas con incidentes abiertos (no bloquear toda la zona)

            const pAnterior = row.proveedorAnteriorId ?? accion.proveedorAnteriorId
            const pNuevo    = row.proveedorNuevoId    ?? accion.proveedorNuevoId
            await _cambiarProveedorTienda(tx, row.tiendaId, pAnterior, pNuevo!, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)
            await tx.update(accionesGestionTiendas).set({ ejecutada: true }).where(eq(accionesGestionTiendas.id, row.id))
          }
        }
      }

      // Activar la ficha nueva si se proporcionó
      let fichaAnteriorIdCapturada: string | null = null
      if (fichaNuevaId) {
        const [fichaData] = await tx
          .select({ id: fichas.id, tiendaId: fichas.tiendaId })
          .from(fichas)
          .where(eq(fichas.id, fichaNuevaId))
          .limit(1)

        if (fichaData) {
          // Capturar la ficha activa anterior ANTES de archivarla
          const [fichaAnterior] = await tx.select({ id: fichas.id })
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
            await tx.update(fichas)
              .set({ estado: 'HISTORICA', archivadoEn: ahora })
              .where(eq(fichas.id, fichaAnteriorIdCapturada))
          }

          // Activar la nueva ficha
          await tx.update(fichas)
            .set({ estado: 'ACTIVA', activadoEn: ahora })
            .where(eq(fichas.id, fichaNuevaId))

          // Actualizar puntero de ficha activa en la tienda
          await tx.update(tiendas)
            .set({ fichaActivaId: fichaNuevaId })
            .where(eq(tiendas.id, fichaData.tiendaId))
        }
      }

      // Ejecutar = la acción queda COMPLETADA. Las evaluaciones 30/90 son opcionales y posteriores.
      const [u] = await tx.update(accionesGestion)
        .set({
          estado:          'COMPLETADO',
          ejecutadoEn:     ahora,
          ejecutadoPorId,
          notasEjecucion:  notasEjecucion || null,
          fichaNuevaId:    fichaNuevaId ?? undefined,
          fichaAnteriorId: fichaAnteriorIdCapturada ?? undefined,
          fechaEval30:     limaDateStr(ahora, 30),
          fechaEval90:     limaDateStr(ahora, 90),
          actualizadoEn:   ahora,
        })
        .where(eq(accionesGestion.id, id))
        .returning()
      return u
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status })
    throw e
  }
}

async function _cambiarProveedorTienda(
  tx: any,
  tiendaId: string,
  proveedorAnteriorId: string | null | undefined,
  proveedorNuevoId: string,
  usuarioId: string,
  referencia: string,
) {
  // Backfill: incidentes históricos sin proveedor_id explícito → atribuir al proveedor anterior
  // Esto preserva la historia aunque cambie tiendas.proveedor_id (evita que COALESCE los mueva)
  if (proveedorAnteriorId) {
    await tx.update(incidentes)
      .set({ proveedorId: proveedorAnteriorId } as any)
      .where(and(
        eq(incidentes.tiendaId, tiendaId),
        isNull((incidentes as any).proveedorId),
      ))
  }

  // Actualizar proveedor de la tienda
  await tx.update(tiendas)
    .set({ proveedorId: proveedorNuevoId } as any)
    .where(eq(tiendas.id, tiendaId))

  // Auditoría
  await tx.insert(tiendasHistorial).values({
    tiendaId,
    usuarioId,
    campoEditado:  'proveedor_id',
    valorAnterior: proveedorAnteriorId ?? null,
    valorNuevo:    `${proveedorNuevoId} — vía ${referencia}`,
  })
}
