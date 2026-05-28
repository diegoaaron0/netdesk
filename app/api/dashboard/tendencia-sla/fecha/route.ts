import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { calcSLACaso, type RawSLARow } from '@/lib/dashboard-sla-calc'
import { calcEficienciaSLA, SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const dia = searchParams.get('dia')  // YYYY-MM-DD
  const proveedorId = searchParams.get('proveedorId') || null

  if (!dia) return NextResponse.json({ error: 'Falta parámetro dia' }, { status: 400 })

  const desde = new Date(dia + 'T00:00:00-05:00').toISOString()
  const hasta  = new Date(dia + 'T23:59:59-05:00').toISOString()

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.evaluable_proveedor,
      COALESCE(p.nombre, pt.nombre) AS prov_nombre,
      t.codigo    AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      n1.hora_correo_n1,
      resp.hora_primera_resp,
      resp.nivel_respuesta,
      resp.eta_str,
      max_n.max_nivel,
      contrato.sla_respuesta_override,
      contrato.sla_resolucion_override
    FROM incidentes i
    JOIN  tiendas    t ON i.tienda_id    = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo AS hora_correo_n1
      FROM   escalamientos
      WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
      ORDER  BY creado_en LIMIT 1
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT hora_respuesta AS hora_primera_resp, nivel AS nivel_respuesta,
             tiempo_estimado_solucion AS eta_str
      FROM   escalamientos
      WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
      ORDER  BY hora_respuesta LIMIT 1
    ) resp ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(MAX(nivel), 0) AS max_nivel
      FROM   escalamientos
      WHERE  incidente_id = i.id
    ) max_n ON true
    LEFT JOIN LATERAL (
      SELECT tiempo_respuesta_sla  AS sla_respuesta_override,
             tiempo_resolucion_sla AS sla_resolucion_override
      FROM   contratos_proveedor
      WHERE  proveedor_id = COALESCE(i.proveedor_id, t.proveedor_id)
        AND  estado = 'VIGENTE'
        AND  (tienda_id IS NULL OR tienda_id = t.id)
      ORDER  BY (tienda_id IS NOT NULL) DESC
      LIMIT  1
    ) contrato ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado = 'RESUELTO'
      AND i.hora_fin IS NOT NULL
      ${proveedorId ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorId}` : sql``}
    ORDER BY i.hora_registro
  `) as unknown as RawSLARow[]

  const casos = rows.map(calcSLACaso)

  return NextResponse.json({
    casos: casos.map((c, idx) => {
      const row = rows[idx]
      const slaRespuestaMin  = (row as any).sla_respuesta_override  ?? SLA_RESPUESTA_MIN
      const slaResolucionMin = (row as any).sla_resolucion_override ?? SLA_RESOLUCION_DEFAULT_MIN
      const eficiencia = c.evaluable ? calcEficienciaSLA({
        tRespuestaMin: c.tPrimeraRespuestaMin,
        tResolucionMin: c.tResolucionMin,
        slaRespuestaMin,
        slaResolucionMin,
      }) : null
      return {
        codigo: c.codigo,
        tiendaCodigo: c.tiendaCodigo,
        tiendaNombre: c.tiendaNombre,
        provNombre: c.provNombre,
        tipo: c.tipo,
        evaluable: c.evaluable,
        nivelFinal: c.nivelFinal,
        nivelQueRespondio: c.nivelQueRespondio,
        tPrimeraRespuestaMin: c.tPrimeraRespuestaMin,
        tResolucionMin: c.tResolucionMin,
        slaRespuesta: c.slaRespuesta,
        slaResolucion: c.slaResolucion,
        slaGeneral: c.slaGeneral,
        cumplioETA: c.cumplioETA,
        motivoIncumplimiento: c.motivoIncumplimiento,
        scoreEficiencia: eficiencia?.scoreSLA ?? null,
        scoreRespuesta: eficiencia?.scoreRespuesta ?? null,
        scoreResolucion: eficiencia?.scoreResolucion ?? null,
        slaRespuestaMin,
        slaResolucionMin,
      }
    }),
  })
}
