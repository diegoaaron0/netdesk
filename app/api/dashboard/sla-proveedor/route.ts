import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import {
  buildProveedorResumen, buildTiemposTable, buildNivelesTable,
  buildCasosFueraSLA, buildConclusiones, type RawSLAProvRow,
} from '@/lib/provider-sla-compliance-calc'
import { fetchProveedoresList } from '@/lib/dashboard-queries'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam  = searchParams.get('desde')
  const hastaParam  = searchParams.get('hasta')
  const proveedorId = searchParams.get('proveedorId') || null

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00').toISOString()
    : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() })()

  const [rows, proveedoresList] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.hora_registro,
        i.hora_fin,
        i.proveedor_id,
        COALESCE(p.nombre, pt.nombre) AS prov_nombre,
        t.codigo    AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        n1.hora_correo_n1,
        resp.hora_primera_resp,
        resp.nivel_respuesta,
        max_n.max_nivel
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores p  ON i.proveedor_id = p.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
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
        AND COALESCE(p.nombre, pt.nombre) IS NOT NULL
        ${proveedorId ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorId}` : sql``}
      ORDER BY i.hora_registro DESC
    `) as unknown as RawSLAProvRow[],
    fetchProveedoresList(),
  ])

  const proveedores   = buildProveedorResumen(rows)
  const tiempos       = buildTiemposTable(rows)
  const niveles       = buildNivelesTable(rows)
  const casosFueraSLA = buildCasosFueraSLA(rows)
  const conclusiones  = buildConclusiones(proveedores, tiempos, niveles)

  const evaluablesTotal = proveedores.reduce((s, p) => s + p.evaluables, 0)
  const dentraTotal     = proveedores.reduce((s, p) => s + p.dentraSLA, 0)
  const fueraSLATotal   = proveedores.reduce((s, p) => s + p.fueraSLA, 0)
  const slaGeneral      = evaluablesTotal > 0 ? Math.round((dentraTotal / evaluablesTotal) * 100) : null

  const respTimes  = proveedores.filter((p) => p.tPromRespuestaMin != null).map((p) => p.tPromRespuestaMin!)
  const resolTimes = proveedores.filter((p) => p.tPromResolucionMin != null).map((p) => p.tPromResolucionMin!)
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  return NextResponse.json({
    proveedores,
    tiempos,
    niveles,
    casosFueraSLA,
    resumenGlobal: {
      proveedoresEvaluados: proveedores.length,
      slaGeneral,
      fueraSLATotal,
      tPromRespuestaMin:  avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
      casosEscaladosN2:   proveedores.reduce((s, p) => s + p.casosEscaladosN2, 0),
    },
    conclusiones,
    proveedoresList,
  })
}
