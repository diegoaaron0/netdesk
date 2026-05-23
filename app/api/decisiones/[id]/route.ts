import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decisiones, tiendas, proveedores, usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail } from '@/lib/mailer'

const aprobador = alias(usuarios, 'aprobador')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.ver'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [dec] = await db.select({
    id:               decisiones.id,
    tipo:             decisiones.tipo,
    titulo:           decisiones.titulo,
    descripcion:      decisiones.descripcion,
    motivo:           decisiones.motivo,
    estado:           decisiones.estado,
    tiendaId:         decisiones.tiendaId,
    proveedorId:      decisiones.proveedorId,
    responsableId:    decisiones.responsableId,
    fechaSeguimiento: decisiones.fechaSeguimiento,
    snapSlaPct:       decisiones.snapSlaPct,
    snapMttrMinutos:  decisiones.snapMttrMinutos,
    snapIei:          decisiones.snapIei,
    snapIncidentes:   decisiones.snapIncidentes,
    snapPeriodo:      decisiones.snapPeriodo,
    ejecutadaEn:      decisiones.ejecutadaEn,
    resultadoNota:    decisiones.resultadoNota,
    postSlaPct:       decisiones.postSlaPct,
    postMttrMinutos:  decisiones.postMttrMinutos,
    postIei:          decisiones.postIei,
    postIncidentes:   decisiones.postIncidentes,
    aprobadoPorId:    decisiones.aprobadoPorId,
    aprobadoEn:       decisiones.aprobadoEn,
    rechazadoMotivo:  decisiones.rechazadoMotivo,
    creadoEn:         decisiones.creadoEn,
    actualizadoEn:    decisiones.actualizadoEn,
    tiendaCodigo:     tiendas.codigo,
    tiendaNombre:     tiendas.nombreCc,
    tiendaDistrito:   tiendas.distrito,
    tiendaCluster:    tiendas.cluster,
    proveedorNombre:  proveedores.nombre,
    proveedorTelefono: proveedores.telefonoSoporte,
    responsableNombre: usuarios.nombre,
    responsableRol:   usuarios.rol,
    responsableEmail: usuarios.email,
    aprobadoPorNombre: aprobador.nombre,
  })
    .from(decisiones)
    .leftJoin(tiendas,     eq(decisiones.tiendaId,      tiendas.id))
    .leftJoin(proveedores, eq(decisiones.proveedorId,   proveedores.id))
    .leftJoin(usuarios,    eq(decisiones.responsableId, usuarios.id))
    .leftJoin(aprobador,   eq(decisiones.aprobadoPorId, aprobador.id))
    .where(eq(decisiones.id, id))

  if (!dec) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(dec)
}

const EDITABLE = new Set([
  'estado', 'titulo', 'descripcion', 'motivo', 'tipo', 'fechaSeguimiento',
  'tiendaId', 'proveedorId',
  'resultadoNota', 'ejecutadaEn',
  'postSlaPct', 'postMttrMinutos', 'postIei', 'postIncidentes',
  'snapSlaPct', 'snapMttrMinutos', 'snapIei', 'snapIncidentes', 'snapPeriodo',
])

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.crear'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  // ── Approval flow (GERENCIA only) ───────────────────────────────────────────
  if (body._action === 'aprobar' || body._action === 'rechazar') {
    const userRol = (session.user as any).rol
    if (userRol !== 'GERENCIA')
      return NextResponse.json({ error: 'Solo GERENCIA puede aprobar o rechazar' }, { status: 403 })

    const aprobadorNombre = (session.user as any).nombre ?? (session.user as any).name ?? 'Gerencia'

    if (body._action === 'aprobar') {
      const [updated] = await db.update(decisiones)
        .set({
          estado:        'PENDIENTE',
          aprobadoPorId: (session.user as any).id,
          aprobadoEn:    new Date(),
          actualizadoEn: new Date(),
        })
        .where(eq(decisiones.id, id))
        .returning()
      if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

      const [decInfo] = await db.select({ titulo: decisiones.titulo, email: usuarios.email })
        .from(decisiones).leftJoin(usuarios, eq(decisiones.responsableId, usuarios.id))
        .where(eq(decisiones.id, id))
      if (decInfo?.email) {
        sendMail({
          to: decInfo.email,
          subject: `✅ Decisión aprobada: ${decInfo.titulo} — NetDesk`,
          text: [
            `Tu decisión "${decInfo.titulo}" fue aprobada por ${aprobadorNombre}.`,
            `Está lista para ejecución. Ingresa a NetDesk > Decisiones para continuar.`,
          ].join('\n'),
        }).catch(e => console.error('[decisiones/aprobar] mail:', e))
      }

      return NextResponse.json(updated)
    }

    // rechazar
    const motivo = (body.rechazadoMotivo ?? '').trim()
    if (!motivo)
      return NextResponse.json({ error: 'rechazadoMotivo es requerido' }, { status: 400 })
    const [updated] = await db.update(decisiones)
      .set({
        estado:          'RECHAZADO',
        rechazadoMotivo: motivo,
        actualizadoEn:   new Date(),
      })
      .where(eq(decisiones.id, id))
      .returning()
    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const [decInfo] = await db.select({ titulo: decisiones.titulo, email: usuarios.email })
      .from(decisiones).leftJoin(usuarios, eq(decisiones.responsableId, usuarios.id))
      .where(eq(decisiones.id, id))
    if (decInfo?.email) {
      sendMail({
        to: decInfo.email,
        subject: `❌ Decisión rechazada: ${decInfo.titulo} — NetDesk`,
        text: [
          `Tu decisión "${decInfo.titulo}" fue rechazada por ${aprobadorNombre}.`,
          `Motivo: ${motivo}`,
          `Ingresa a NetDesk > Decisiones para ver los detalles.`,
        ].join('\n'),
      }).catch(e => console.error('[decisiones/rechazar] mail:', e))
    }

    return NextResponse.json(updated)
  }

  // ── Regular edit ─────────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (EDITABLE.has(key)) patch[key] = body[key]
  }

  if (patch.estado === 'EJECUTADA' && !patch.ejecutadaEn) {
    patch.ejecutadaEn = new Date()
  }

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
