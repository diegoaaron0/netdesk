import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedoresNiveles } from '@/drizzle/schema'
import { eq, and, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [actual] = await db.select().from(proveedoresNiveles)
    .where(and(eq(proveedoresNiveles.id, nivelId), eq(proveedoresNiveles.proveedorId, id))).limit(1)
  if (!actual) return NextResponse.json({ error: 'Nivel no encontrado' }, { status: 404 })

  const body = await req.json()
  const v = {
    nombreContacto:         body.nombreContacto         ?? actual.nombreContacto,
    email:                  body.email                  || null,
    celular:                body.celular                || null,
    tiempoRespSev1:         body.tiempoRespSev1          || null,
    tiempoRespSev2:         body.tiempoRespSev2          || null,
    tiempoRespSev3:         body.tiempoRespSev3          || null,
    correosCopia:           body.correosCopia            ?? null,
    whatsapp:               body.whatsapp                || null,
    canal:                  body.canal                   || 'correo',
    horarioAtencion:        body.horarioAtencion         || null,
    tiempoEsperadoSolucion: body.tiempoEsperadoSolucion  ?? null,
    instruccion:            body.instruccion             || null,
    activo:                 body.activo                  ?? actual.activo,
  }
  const [updated] = await db.update(proveedoresNiveles).set(v).where(eq(proveedoresNiveles.id, nivelId)).returning()

  // Propagación (molde vivo): actualizar el mismo nivel en las fichas SINCRONIZADAS (no personalizadas)
  // del proveedor. Las personalizadas se respetan.
  await db.execute(sql`
    UPDATE fichas_niveles fn
    SET nombre_contacto = ${v.nombreContacto}, email = ${v.email}, celular = ${v.celular},
        tiempo_resp_sev1 = ${v.tiempoRespSev1}, tiempo_resp_sev2 = ${v.tiempoRespSev2},
        tiempo_resp_sev3 = ${v.tiempoRespSev3}, correos_copia = ${v.correosCopia as any},
        whatsapp = ${v.whatsapp}, canal = ${v.canal}, horario_atencion = ${v.horarioAtencion},
        tiempo_esperado_solucion = ${v.tiempoEsperadoSolucion}, instruccion = ${v.instruccion},
        activo = ${v.activo}
    FROM fichas f
    WHERE fn.ficha_id = f.id
      AND f.proveedor_id = ${id}
      AND fn.nivel = ${actual.nivel}
      AND fn.personalizado = false
      AND f.estado <> 'HISTORICA'
  `)

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Decisión 2: borrar SOLO el default del proveedor. Las fichas conservan su nivel
  // (deja de propagarse). El aviso de esta consecuencia se muestra en la UI.
  await db.delete(proveedoresNiveles)
    .where(and(eq(proveedoresNiveles.id, nivelId), eq(proveedoresNiveles.proveedorId, id)))
  return NextResponse.json({ ok: true })
}
