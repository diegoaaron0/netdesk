import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  accionesGestion, accionesGestionTiendas,
  tiendas, tiendasHistorial, incidentes, fichas,
} from '@/drizzle/schema'
import { eq, and, isNull, ne, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { TIPOS_CON_FICHA } from '@/lib/gestion-cambios-config'

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
  // BAJA_CONTRATO no está en TIPOS_CON_FICHA: no lleva ficha nueva, archiva la actual.
  const fichaNuevaId: string | null = accion.fichaNuevaId ?? null
  if (TIPOS_CON_FICHA.includes(accion.tipo) && !fichaNuevaId)
    return NextResponse.json({ error: 'La acción no tiene ficha adjunta. Vuelve a proponerla adjuntando la ficha.' }, { status: 409 })

  // Re-validar la ficha al EJECUTAR (por si la editaron/activaron entre proponer y ejecutar)
  let fichaProveedorId: string | null = null
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
    fichaProveedorId = f.proveedorId
  }

  // CAMBIO_CONTRATO (tipo fusionado: antes CAMBIO_PROVEEDOR + ACTUALIZACION_PLAN):
  // el bloqueo de incidentes abiertos y el cambio de tiendas.proveedor_id solo
  // aplican si el proveedor REALMENTE cambia — no por el nombre del tipo. Se
  // determina comparando el proveedor anterior capturado en la acción contra
  // el proveedor de la ficha que se está activando. Si no se puede confirmar
  // que son el mismo (dato faltante), se trata como cambio (más seguro).
  const proveedorCambiaEnTienda =
    !(accion.proveedorAnteriorId && fichaProveedorId && accion.proveedorAnteriorId === fichaProveedorId)

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
      // ── CAMBIO_CONTRATO: cambia el proveedor de la tienda solo si el
      // proveedor realmente cambia (ver proveedorCambiaEnTienda arriba) ──────
      if (accion.tipo === 'CAMBIO_CONTRATO' && proveedorCambiaEnTienda) {
        const proveedorNuevoReal = fichaProveedorId ?? accion.proveedorNuevoId
        if (!proveedorNuevoReal)
          throw new HttpError(400, 'Falta proveedor nuevo')

        if (accion.alcance === 'TIENDA') {
          if (!accion.tiendaId)
            throw new HttpError(400, 'Falta tienda')

          await _bloquearSiIncidentesAbiertos(tx, accion.tiendaId)
          await _cambiarProveedorTienda(tx, accion.tiendaId, accion.proveedorAnteriorId, proveedorNuevoReal, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)

        } else {
          // ZONA: iterar cada tienda del scope (sin ficha por tienda hoy — igual que antes)
          const tScope = await tx.select().from(accionesGestionTiendas)
            .where(eq(accionesGestionTiendas.accionId, id))

          for (const row of tScope) {
            const pAnterior = row.proveedorAnteriorId ?? accion.proveedorAnteriorId
            const pNuevo    = row.proveedorNuevoId    ?? proveedorNuevoReal
            if (pAnterior && pNuevo && pAnterior === pNuevo) continue // sin cambio real de proveedor para esta tienda

            const cnt = await _contarIncidentesAbiertos(tx, row.tiendaId)
            if (cnt > 0) continue // omitir tiendas con incidentes abiertos (no bloquear toda la zona)

            await _cambiarProveedorTienda(tx, row.tiendaId, pAnterior, pNuevo!, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`)
            await tx.update(accionesGestionTiendas).set({ ejecutada: true }).where(eq(accionesGestionTiendas.id, row.id))
          }
        }
      }

      // ── BAJA_CONTRATO: bloquea SIEMPRE por incidentes abiertos (igual de
      // estricto que CAMBIO_PROVEEDOR antes). No lleva ficha nueva: archiva la
      // ficha ACTIVA de la tienda a DADA_DE_BAJA (no HISTORICA — no hay
      // reemplazo) y deja la tienda sin proveedor/ficha activa. ────────────────
      let fichaAnteriorIdCapturada: string | null = null
      if (accion.tipo === 'BAJA_CONTRATO') {
        if (accion.alcance === 'TIENDA') {
          if (!accion.tiendaId)
            throw new HttpError(400, 'Falta tienda')

          await _bloquearSiIncidentesAbiertos(tx, accion.tiendaId)
          fichaAnteriorIdCapturada = await _darDeBajaContrato(tx, accion.tiendaId, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`, ahora)

        } else {
          const tScope = await tx.select().from(accionesGestionTiendas)
            .where(eq(accionesGestionTiendas.accionId, id))

          for (const row of tScope) {
            const cnt = await _contarIncidentesAbiertos(tx, row.tiendaId)
            if (cnt > 0) continue // omitir tiendas con incidentes abiertos (no bloquear toda la zona)

            await _darDeBajaContrato(tx, row.tiendaId, ejecutadoPorId, `${accion.codigo}: ${accion.titulo}`, ahora)
            await tx.update(accionesGestionTiendas).set({ ejecutada: true }).where(eq(accionesGestionTiendas.id, row.id))
          }
        }
      }

      // Activar la ficha nueva si se proporcionó (RENOVACION_CONTRATO / CAMBIO_CONTRATO)
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

async function _contarIncidentesAbiertos(tx: any, tiendaId: string): Promise<number> {
  const [{ cnt }] = await tx.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM incidentes
    WHERE tienda_id = ${tiendaId}
      AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
  `) as any[]
  return Number(cnt)
}

async function _bloquearSiIncidentesAbiertos(tx: any, tiendaId: string): Promise<void> {
  const cnt = await _contarIncidentesAbiertos(tx, tiendaId)
  if (cnt > 0)
    throw new HttpError(409,
      `La tienda tiene ${cnt} incidente${cnt > 1 ? 's' : ''} abierto${cnt > 1 ? 's' : ''}. Resuelve todos antes de ejecutar.`,
      { incidentesAbiertos: cnt })
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

// Archiva la ficha ACTIVA de la tienda a DADA_DE_BAJA y deja la tienda sin
// proveedor/ficha activa. Devuelve el id de la ficha archivada (o null si la
// tienda no tenía ficha activa), para registrarlo como fichaAnteriorId de la acción.
async function _darDeBajaContrato(
  tx: any,
  tiendaId: string,
  usuarioId: string,
  referencia: string,
  ahora: Date,
): Promise<string | null> {
  const [fichaActiva] = await tx.select({ id: fichas.id })
    .from(fichas)
    .where(and(eq(fichas.tiendaId, tiendaId), eq(fichas.estado, 'ACTIVA')))
    .limit(1)

  if (fichaActiva) {
    await tx.update(fichas)
      .set({ estado: 'DADA_DE_BAJA', archivadoEn: ahora })
      .where(eq(fichas.id, fichaActiva.id))
  }

  const [tiendaActual] = await tx.select({ proveedorId: tiendas.proveedorId })
    .from(tiendas).where(eq(tiendas.id, tiendaId)).limit(1)

  await tx.update(tiendas)
    .set({ fichaActivaId: null, proveedorId: null } as any)
    .where(eq(tiendas.id, tiendaId))

  await tx.insert(tiendasHistorial).values({
    tiendaId,
    usuarioId,
    campoEditado:  'proveedor_id',
    valorAnterior: tiendaActual?.proveedorId ?? null,
    valorNuevo:    `null (contrato dado de baja) — vía ${referencia}`,
  })

  return fichaActiva?.id ?? null
}
