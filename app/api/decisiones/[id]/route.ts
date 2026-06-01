import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decisiones, tiendas, proveedores, usuarios, incidentes, contratosProveedor, tiendasHistorial } from '@/drizzle/schema'
import { eq, and, isNull, notInArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail } from '@/lib/mailer'

const aprobador  = alias(usuarios, 'aprobador')
const provAnterior = alias(proveedores, 'prov_anterior')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.ver'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [dec] = await db.select({
    id:                  decisiones.id,
    tipo:                decisiones.tipo,
    titulo:              decisiones.titulo,
    descripcion:         decisiones.descripcion,
    motivo:              decisiones.motivo,
    estado:              decisiones.estado,
    tiendaId:            decisiones.tiendaId,
    proveedorId:         decisiones.proveedorId,
    proveedorAnteriorId: decisiones.proveedorAnteriorId,
    responsableId:       decisiones.responsableId,
    fechaSeguimiento:    decisiones.fechaSeguimiento,
    snapSlaPct:          decisiones.snapSlaPct,
    snapMttrMinutos:     decisiones.snapMttrMinutos,
    snapIei:             decisiones.snapIei,
    snapIncidentes:      decisiones.snapIncidentes,
    snapPeriodo:         decisiones.snapPeriodo,
    snapDetalle:         decisiones.snapDetalle,
    ejecutadaEn:         decisiones.ejecutadaEn,
    resultadoNota:       decisiones.resultadoNota,
    postSlaPct:          decisiones.postSlaPct,
    postMttrMinutos:     decisiones.postMttrMinutos,
    postIei:             decisiones.postIei,
    postIncidentes:      decisiones.postIncidentes,
    postDetalle:         decisiones.postDetalle,
    aprobadoPorId:       decisiones.aprobadoPorId,
    aprobadoEn:          decisiones.aprobadoEn,
    rechazadoMotivo:     decisiones.rechazadoMotivo,
    creadoEn:            decisiones.creadoEn,
    actualizadoEn:       decisiones.actualizadoEn,
    tiendaCodigo:        tiendas.codigo,
    tiendaNombre:        tiendas.nombreCc,
    tiendaDistrito:      tiendas.distrito,
    tiendaCluster:       tiendas.cluster,
    proveedorNombre:     proveedores.nombre,
    proveedorAnteriorNombre: provAnterior.nombre,
    responsableNombre:   usuarios.nombre,
    responsableRol:      usuarios.rol,
    responsableEmail:    usuarios.email,
    aprobadoPorNombre:   aprobador.nombre,
  })
    .from(decisiones)
    .leftJoin(tiendas,       eq(decisiones.tiendaId,            tiendas.id))
    .leftJoin(proveedores,   eq(decisiones.proveedorId,         proveedores.id))
    .leftJoin(provAnterior,  eq(decisiones.proveedorAnteriorId, provAnterior.id))
    .leftJoin(usuarios,      eq(decisiones.responsableId,       usuarios.id))
    .leftJoin(aprobador,     eq(decisiones.aprobadoPorId,       aprobador.id))
    .where(eq(decisiones.id, id))

  if (!dec) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(dec)
}

const EDITABLE = new Set([
  'estado', 'titulo', 'descripcion', 'motivo', 'tipo', 'fechaSeguimiento',
  'tiendaId', 'proveedorId', 'proveedorAnteriorId',
  'resultadoNota', 'ejecutadaEn',
  'postSlaPct', 'postMttrMinutos', 'postIei', 'postIncidentes', 'postDetalle',
  'snapSlaPct', 'snapMttrMinutos', 'snapIei', 'snapIncidentes', 'snapPeriodo', 'snapDetalle',
])

const PUEDE_APROBAR = new Set(['SUPERVISOR', 'GERENCIA'])

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.crear'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body     = await req.json()
  const userRol  = (session.user as any).rol as string
  const userId   = (session.user as any).id  as string
  const userName = (session.user as any).nombre ?? (session.user as any).name ?? userRol

  // ── Aprobar / Rechazar ───────────────────────────────────────────────────────
  if (body._action === 'aprobar' || body._action === 'rechazar') {
    if (!PUEDE_APROBAR.has(userRol))
      return NextResponse.json({ error: 'Solo SUPERVISOR o GERENCIA pueden aprobar o rechazar' }, { status: 403 })

    if (body._action === 'aprobar') {
      const [updated] = await db.update(decisiones)
        .set({ estado: 'PENDIENTE', aprobadoPorId: userId, aprobadoEn: new Date(), actualizadoEn: new Date() })
        .where(eq(decisiones.id, id))
        .returning()
      if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

      const [info] = await db.select({ titulo: decisiones.titulo, email: usuarios.email })
        .from(decisiones).leftJoin(usuarios, eq(decisiones.responsableId, usuarios.id))
        .where(eq(decisiones.id, id))
      if (info?.email) {
        sendMail({
          to: info.email,
          subject: `✅ Decisión aprobada: ${info.titulo} — NetDesk`,
          text: `Tu decisión "${info.titulo}" fue aprobada por ${userName}.\nIngresa a NetDesk > Decisiones para continuar.`,
        }).catch(e => console.error('[decisiones/aprobar] mail:', e))
      }
      return NextResponse.json(updated)
    }

    // rechazar
    const motivo = (body.rechazadoMotivo ?? '').trim()
    if (!motivo)
      return NextResponse.json({ error: 'rechazadoMotivo es requerido' }, { status: 400 })
    const [updated] = await db.update(decisiones)
      .set({ estado: 'RECHAZADO', rechazadoMotivo: motivo, actualizadoEn: new Date() })
      .where(eq(decisiones.id, id))
      .returning()
    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const [info] = await db.select({ titulo: decisiones.titulo, email: usuarios.email })
      .from(decisiones).leftJoin(usuarios, eq(decisiones.responsableId, usuarios.id))
      .where(eq(decisiones.id, id))
    if (info?.email) {
      sendMail({
        to: info.email,
        subject: `❌ Decisión rechazada: ${info.titulo} — NetDesk`,
        text: `Tu decisión "${info.titulo}" fue rechazada por ${userName}.\nMotivo: ${motivo}`,
      }).catch(e => console.error('[decisiones/rechazar] mail:', e))
    }
    return NextResponse.json(updated)
  }

  // ── Ejecutar cambio de proveedor ─────────────────────────────────────────────
  if (body._action === 'ejecutar') {
    if (!PUEDE_APROBAR.has(userRol))
      return NextResponse.json({ error: 'Solo SUPERVISOR o GERENCIA pueden ejecutar' }, { status: 403 })

    const [dec] = await db.select({
      tiendaId:            decisiones.tiendaId,
      proveedorId:         decisiones.proveedorId,
      proveedorAnteriorId: decisiones.proveedorAnteriorId,
      tipo:                decisiones.tipo,
      estado:              decisiones.estado,
    }).from(decisiones).where(eq(decisiones.id, id))

    if (!dec) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (dec.tipo !== 'CAMBIO_PROVEEDOR')
      return NextResponse.json({ error: 'Solo aplicable a CAMBIO_PROVEEDOR' }, { status: 400 })
    if (!dec.tiendaId || !dec.proveedorId)
      return NextResponse.json({ error: 'La decisión requiere tienda y proveedor nuevo' }, { status: 400 })
    if (!['PENDIENTE', 'EN_EJECUCION'].includes(dec.estado ?? ''))
      return NextResponse.json({ error: 'La decisión debe estar en estado PENDIENTE para ejecutarse' }, { status: 400 })

    // Verificar incidentes abiertos — bloquear si hay
    const abiertos = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM incidentes
      WHERE tienda_id = ${dec.tiendaId}
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    const cntAbiertos = (abiertos as any[])[0]?.cnt ?? 0
    if (cntAbiertos > 0)
      return NextResponse.json({
        error: `La tienda tiene ${cntAbiertos} incidente${cntAbiertos > 1 ? 's' : ''} abierto${cntAbiertos > 1 ? 's' : ''}. Resuelve todos antes de ejecutar el cambio.`,
        incidentesAbiertos: cntAbiertos,
      }, { status: 409 })

    // Atribuir incidentes activos sin proveedor_id al proveedor anterior
    if (dec.proveedorAnteriorId) {
      await db.update(incidentes)
        .set({ proveedorId: dec.proveedorAnteriorId } as any)
        .where(and(
          eq(incidentes.tiendaId, dec.tiendaId),
          isNull((incidentes as any).proveedorId),
          notInArray(incidentes.estado, ['RESUELTO', 'CANCELADO', 'CERRADO']),
        ))
    }

    // Marcar contrato vigente anterior como EXPIRADO
    if (dec.proveedorAnteriorId) {
      await db.update(contratosProveedor)
        .set({ estado: 'EXPIRADO' } as any)
        .where(and(
          eq(contratosProveedor.tiendaId, dec.tiendaId),
          eq(contratosProveedor.proveedorId, dec.proveedorAnteriorId),
          eq(contratosProveedor.estado, 'VIGENTE'),
        ))
    }

    // Cambiar proveedor de la tienda
    await db.update(tiendas)
      .set({ proveedorId: dec.proveedorId } as any)
      .where(eq(tiendas.id, dec.tiendaId))

    // Historial de tienda
    await db.insert(tiendasHistorial).values({
      tiendaId:      dec.tiendaId,
      usuarioId:     userId,
      campoEditado:  'proveedor_id',
      valorAnterior: dec.proveedorAnteriorId ?? null,
      valorNuevo:    dec.proveedorId,
    })

    // Marcar decisión como ejecutada
    const [updated] = await db.update(decisiones)
      .set({ estado: 'EJECUTADA', ejecutadaEn: new Date(), actualizadoEn: new Date() })
      .where(eq(decisiones.id, id))
      .returning()

    return NextResponse.json(updated)
  }

  // ── Edición regular ──────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (EDITABLE.has(key)) patch[key] = body[key]
  }
  if (patch.estado === 'EJECUTADA' && !patch.ejecutadaEn) patch.ejecutadaEn = new Date()
  patch.actualizadoEn = new Date()

  const [updated] = await db.update(decisiones)
    .set(patch as any)
    .where(eq(decisiones.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.crear'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [cancelled] = await db.update(decisiones)
    .set({ estado: 'CANCELADA', actualizadoEn: new Date() })
    .where(eq(decisiones.id, id))
    .returning({ id: decisiones.id })

  if (!cancelled) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
