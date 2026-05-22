import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { EvidenciaIncidente } from '@/types/insights'
import { calcSLARow } from '@/lib/sla-core'
import { calcImpactoRow } from '@/lib/impacto-calc'
import { getZona } from '@/lib/geo-zones'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo     = searchParams.get('tipo')     // 'proveedor' | 'tienda' | 'zona' | 'tipo' | 'global'
  const entidad  = searchParams.get('entidad')  // nombre del proveedor, tienda, zona, etc.
  const desdeP   = searchParams.get('desde')
  const hastaP   = searchParams.get('hasta')

  const hasta = hastaP ? new Date(hastaP + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
  const desde = desdeP ? new Date(desdeP + 'T00:00:00-05:00').toISOString() : (() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
  })()

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.estado,
      i.otros_clasificacion,
      p.nombre        AS prov_nombre,
      t.nombre_cc     AS tienda_nombre,
      t.distrito      AS tienda_distrito,
      t.cluster,
      t.venta_hora_soles::float AS venta_hora_soles,
      COALESCE(t.contingencia_activa, false) AS contingencia_activa,
      n1.hora_correo_n1,
      resp.hora_primera_resp,
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
      SELECT hora_respuesta AS hora_primera_resp
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
      ${tipo === 'proveedor' && entidad ? sql`AND p.nombre ILIKE ${entidad}` : sql``}
      ${tipo === 'tienda'    && entidad ? sql`AND t.nombre ILIKE ${entidad}` : sql``}
      ${tipo === 'tipo'      && entidad ? sql`AND i.tipo = ${entidad}` : sql``}
    ORDER BY i.hora_registro DESC
    LIMIT 200
  `) as unknown as Array<{
    id: string; codigo: string; tipo: string; hora_registro: string; hora_fin: string | null
    estado: string; otros_clasificacion: string | null; prov_nombre: string | null
    tienda_nombre: string | null; tienda_distrito: string | null; cluster: string | null
    venta_hora_soles: number | null; contingencia_activa: boolean
    hora_correo_n1: string | null; hora_primera_resp: string | null; max_nivel: number
  }>

  const filtered = tipo === 'zona' && entidad
    ? rows.filter(r => getZona(r.tienda_distrito, r.cluster) === entidad)
    : rows

  const evidencias: EvidenciaIncidente[] = filtered.map(r => {
    const impacto = calcImpactoRow({
      hora_registro: r.hora_registro,
      hora_fin: r.hora_fin,
      estado: r.estado,
      venta_hora_soles: r.venta_hora_soles,
      tipo: r.tipo,
      cluster: r.cluster,
      contingencia_activa: r.contingencia_activa,
    })
    const mttrMin = impacto.mttrMin
    const impactoEstimado = impacto.impactoEstimado > 0 ? impacto.impactoEstimado : null

    let slaCumplido: boolean | null = null
    if (r.estado === 'RESUELTO' && r.hora_fin != null && r.hora_correo_n1 != null && r.max_nivel >= 1) {
      const sla = calcSLARow({
        tipo: r.tipo,
        hora_correo_n1: r.hora_correo_n1,
        hora_primera_resp: r.hora_primera_resp,
        hora_fin: r.hora_fin,
        max_nivel: r.max_nivel,
      })
      slaCumplido = sla.evaluable ? sla.slaGeneral : null
    }
    return {
      id: r.id, codigo: r.codigo, tipo: r.tipo,
      proveedor: r.prov_nombre ?? '—',
      tienda: r.tienda_nombre ?? '—',
      distrito: r.tienda_distrito ?? '—',
      horaRegistro: r.hora_registro, horaFin: r.hora_fin,
      estado: r.estado, slaCumplido, mttrMin, impactoEstimado,
      otrosClasificacion: r.otros_clasificacion,
    }
  })

  return NextResponse.json({ evidencias })
}
