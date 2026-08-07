import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, proveedoresNiveles } from '@/drizzle/schema'
import { eq, and, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// Escalamientos por DEFECTO de un proveedor (el "molde").

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const niveles = await db.select().from(proveedoresNiveles)
    .where(eq(proveedoresNiveles.proveedorId, id))
    .orderBy(proveedoresNiveles.nivel)
  return NextResponse.json(niveles)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [prov] = await db.select({ id: proveedores.id }).from(proveedores).where(eq(proveedores.id, id)).limit(1)
  if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  const body = await req.json()
  if (!body.nivel || !body.nombreContacto)
    return NextResponse.json({ error: 'nivel y nombreContacto son obligatorios' }, { status: 400 })

  const [dup] = await db.select({ id: proveedoresNiveles.id }).from(proveedoresNiveles)
    .where(and(eq(proveedoresNiveles.proveedorId, id), eq(proveedoresNiveles.nivel, Number(body.nivel)))).limit(1)
  if (dup) return NextResponse.json({ error: `El proveedor ya tiene un nivel N${body.nivel}. Edítalo en vez de duplicarlo.` }, { status: 409 })

  const valores = {
    proveedorId:            id,
    nivel:                  Number(body.nivel),
    nombreContacto:         body.nombreContacto,
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
    activo:                 body.activo                  ?? true,
  }
  const [nivel] = await db.insert(proveedoresNiveles).values(valores).returning()

  // Propagación (decisión 1): agregar este nivel a las fichas vivas del proveedor que NO lo tengan,
  // marcado como sincronizado (personalizado=false).
  await db.execute(sql`
    INSERT INTO fichas_niveles
      (ficha_id, nivel, nombre_contacto, email, celular, tiempo_resp_sev1, tiempo_resp_sev2,
       tiempo_resp_sev3, correos_copia, whatsapp, canal, horario_atencion, tiempo_esperado_solucion,
       instruccion, activo, personalizado)
    SELECT f.id, ${valores.nivel}, ${valores.nombreContacto}, ${valores.email}, ${valores.celular},
           ${valores.tiempoRespSev1}, ${valores.tiempoRespSev2}, ${valores.tiempoRespSev3},
           ${valores.correosCopia as any}, ${valores.whatsapp}, ${valores.canal}, ${valores.horarioAtencion},
           ${valores.tiempoEsperadoSolucion}, ${valores.instruccion}, ${valores.activo}, false
    FROM fichas f
    WHERE f.proveedor_id = ${id}
      AND f.estado NOT IN ('HISTORICA', 'DADA_DE_BAJA')
      AND NOT EXISTS (SELECT 1 FROM fichas_niveles fn WHERE fn.ficha_id = f.id AND fn.nivel = ${valores.nivel})
  `)

  return NextResponse.json(nivel, { status: 201 })
}
