import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { calcSLACaso, type RawSLARow } from '@/lib/dashboard-sla-calc'
import { getVentaHoraEstimadaOrNull } from '@/lib/dashboard-calculations'
import { calcImpactoRow } from '@/lib/impacto-calc'
import { fetchVentasDiarias } from '@/lib/dashboard-queries'
import type { RawTiendaRow } from '@/lib/critical-stores-calc'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tiendaCodigo = searchParams.get('tiendaCodigo')
  const desdeParam   = searchParams.get('desde')
  const hastaParam   = searchParams.get('hasta')

  if (!tiendaCodigo) return NextResponse.json({ error: 'Falta tiendaCodigo' }, { status: 400 })

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() })()

  const [rows, ventasDiarias] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.estado,
        i.hora_registro,
        i.hora_fin,
        i.mttr_minutos,
        i.proveedor_id,
        p.nombre    AS prov_nombre,
        t.id        AS tienda_id,
        t.codigo    AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        t.distrito  AS tienda_distrito,
        t.cluster,
        t.venta_hora_soles::float             AS venta_hora_soles,
        COALESCE(t.tiene_contingencia, false)  AS tiene_contingencia,
        COALESCE(t.contingencia_activa, false) AS contingencia_activa,
        EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'America/Lima')::int AS dia_semana,
        n1.hora_correo_n1,
        resp.hora_primera_resp,
        resp.nivel_respuesta,
        max_n.max_nivel
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
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
        AND i.estado != 'CANCELADO'
        AND t.codigo = ${tiendaCodigo}
      ORDER BY i.hora_registro DESC
    `) as unknown as RawTiendaRow[],
    fetchVentasDiarias(),
  ])

  const historial = rows.map((row) => {
    const slaCaso = (row.estado === 'RESUELTO' && row.hora_fin != null)
      ? calcSLACaso(row as unknown as RawSLARow)
      : null

    const ventaHora = getVentaHoraEstimadaOrNull(
      row.tienda_codigo, row.dia_semana, row.venta_hora_soles, row.cluster, ventasDiarias,
    )
    const costoEstimado = calcImpactoRow({
      hora_registro: row.hora_registro,
      hora_fin: row.hora_fin,
      estado: row.estado,
      tipo: row.tipo,
      ventaHoraResolvida: ventaHora,
      contingencia_activa: row.contingencia_activa,
    }).impactoEstimado

    const fecha = new Date(row.hora_registro).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
    })

    return {
      id: row.id,
      codigo: row.codigo,
      fecha,
      tipo: row.tipo,
      provNombre: row.prov_nombre ?? '—',
      duracionMin: row.mttr_minutos,
      slaGeneral: slaCaso?.evaluable ? slaCaso.slaGeneral : null,
      costoEstimado,
      estado: row.estado,
    }
  })

  return NextResponse.json({ historial })
}
