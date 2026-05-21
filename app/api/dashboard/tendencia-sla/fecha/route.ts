import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { calcSLACaso, type RawSLARow } from '@/lib/dashboard-sla-calc'
import { calcEficienciaSLA, SLA_RESPUESTA_MIN, getSlaResolucionMin } from '@/lib/sla-core'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const dia = searchParams.get('dia')  // YYYY-MM-DD
  const proveedorId = searchParams.get('proveedorId') || null

  if (!dia) return NextResponse.json({ error: 'Falta parámetro dia' }, { status: 400 })

  const desde = new Date(dia + 'T00:00:00').toISOString()
  const hasta  = new Date(dia + 'T23:59:59').toISOString()

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      p.nombre    AS prov_nombre,
      t.codigo    AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      n1.hora_correo_n1,
      resp.hora_primera_resp,
      resp.nivel_respuesta,
      max_n.max_nivel
    FROM incidentes i
    JOIN  tiendas    t ON i.tienda_id    = t.id
    LEFT JOIN proveedores p ON i.proveedor_id = p.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo AS hora_correo_n1
      FROM   escalamientos
      WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
      ORDER  BY creado_en LIMIT 1
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT hora_respuesta AS hora_primera_resp, nivel AS nivel_respuesta
      FROM   escalamientos
      WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
      ORDER  BY hora_respuesta LIMIT 1
    ) resp ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(MAX(nivel), 0) AS max_nivel
      FROM   escalamientos
      WHERE  incidente_id = i.id
    ) max_n ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado = 'RESUELTO'
      AND i.hora_fin IS NOT NULL
      ${proveedorId ? sql`AND p.nombre = ${proveedorId}` : sql``}
    ORDER BY i.hora_registro
  `) as unknown as RawSLARow[]

  const casos = rows.map(calcSLACaso)

  return NextResponse.json({
    casos: casos.map((c) => {
      const slaResolucionMin = getSlaResolucionMin(c.tipo)
      const eficiencia = c.evaluable ? calcEficienciaSLA({
        tRespuestaMin: c.tPrimeraRespuestaMin,
        tResolucionMin: c.tResolucionMin,
        slaRespuestaMin: SLA_RESPUESTA_MIN,
        slaResolucionMin,
      }) : null
      return {
        codigo: c.codigo,
        tiendaCodigo: c.tiendaCodigo,
        tiendaNombre: c.tiendaNombre,
        provNombre: c.provNombre,
        tipo: c.tipo,
        evaluable: c.evaluable,
        nivelQueRespondio: c.nivelQueRespondio,
        tPrimeraRespuestaMin: c.tPrimeraRespuestaMin,
        tResolucionMin: c.tResolucionMin,
        slaRespuesta: c.slaRespuesta,
        slaResolucion: c.slaResolucion,
        slaGeneral: c.slaGeneral,
        motivoIncumplimiento: c.motivoIncumplimiento,
        scoreEficiencia: eficiencia?.scoreSLA ?? null,
        scoreRespuesta: eficiencia?.scoreRespuesta ?? null,
        scoreResolucion: eficiencia?.scoreResolucion ?? null,
        slaResolucionMin,
      }
    }),
  })
}
