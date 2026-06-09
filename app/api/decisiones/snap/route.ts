import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tiendaId = searchParams.get('tiendaId')
  if (!tiendaId) return NextResponse.json({ error: 'tiendaId requerido' }, { status: 400 })

  // Últimos 90 días
  const desde = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  const [tiendaRow, indicadores, contratoRow] = await Promise.all([
    // Proveedor actual de la tienda
    db.execute(sql`
      SELECT t.id, t.codigo, t.nombre_cc, t.cluster,
             p.id AS proveedor_id, p.nombre AS proveedor_nombre
      FROM tiendas t
      LEFT JOIN proveedores p ON t.proveedor_id = p.id
      WHERE t.id = ${tiendaId}
      LIMIT 1
    `),

    // KPIs de los últimos 90 días
    db.execute(sql`
      SELECT
        COUNT(*)::int                                                      AS total_incidentes,
        COUNT(*) FILTER (WHERE estado = 'RESUELTO')::int                  AS resueltos,
        ROUND(AVG(mttr_minutos) FILTER (WHERE estado = 'RESUELTO'))::int  AS mttr_promedio,
        COALESCE(SUM(
          CASE WHEN estado = 'RESUELTO' AND evaluable_proveedor = true THEN 1 ELSE 0 END
        ), 0)::int                                                         AS evaluables,

        -- SLA Respuesta: % donde se respondió dentro del límite
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE estado = 'RESUELTO'
              AND evaluable_proveedor = true
              AND EXISTS (
                SELECT 1 FROM escalamientos e
                WHERE e.incidente_id = i.id
                  AND e.hora_envio_correo IS NOT NULL
                  AND e.hora_respuesta IS NOT NULL
              )
          ) / NULLIF(COUNT(*) FILTER (
            WHERE estado = 'RESUELTO' AND evaluable_proveedor = true
          ), 0)
        , 1)                                                               AS sla_respuesta_pct,

        -- SLA Resolución: % resueltos dentro del límite de tiempo
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE estado = 'RESUELTO'
              AND evaluable_proveedor = true
              AND mttr_minutos IS NOT NULL
              AND mttr_minutos <= 90
          ) / NULLIF(COUNT(*) FILTER (
            WHERE estado = 'RESUELTO' AND evaluable_proveedor = true
          ), 0)
        , 1)                                                               AS sla_resolucion_pct,

        -- Incidentes con SLA vencido (abiertos que ya superaron límite)
        COUNT(*) FILTER (
          WHERE estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
            AND EXTRACT(EPOCH FROM (NOW() - hora_registro)) / 60 > 90
        )::int                                                             AS incidentes_sla_vencido,

        -- IEI acumulado (resueltos con cálculo)
        0::numeric                                                         AS iei_acumulado

      FROM incidentes i
      WHERE i.tienda_id = ${tiendaId}
        AND i.hora_registro >= ${desde}::timestamptz
    `),

    // Contrato vigente
    db.execute(sql`
      SELECT c.sla_respuesta_min, c.sla_resolucion_min, p.nombre AS proveedor_nombre
      FROM contratos_proveedor c
      JOIN proveedores p ON c.proveedor_id = p.id
      JOIN tiendas t ON c.tienda_id = t.id
      WHERE c.tienda_id = ${tiendaId}
        AND c.estado = 'VIGENTE'
        AND t.proveedor_id = c.proveedor_id
      LIMIT 1
    `),
  ])

  const tienda = (tiendaRow as any[])[0]
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const kpi = (indicadores as any[])[0] ?? {}
  const contrato = (contratoRow as any[])[0] ?? null

  return NextResponse.json({
    tienda: {
      id:             tienda.id,
      codigo:         tienda.codigo,
      nombreCc:       tienda.nombre_cc,
      cluster:        tienda.cluster,
      proveedorId:    tienda.proveedor_id,
      proveedorNombre: tienda.proveedor_nombre,
    },
    snap: {
      totalIncidentes:      kpi.total_incidentes ?? 0,
      resueltos:            kpi.resueltos ?? 0,
      mttrPromedio:         kpi.mttr_promedio ?? null,
      slaRespuestaPct:      kpi.sla_respuesta_pct != null ? Number(kpi.sla_respuesta_pct) : null,
      slaResolucionPct:     kpi.sla_resolucion_pct != null ? Number(kpi.sla_resolucion_pct) : null,
      incidentesSlaVencido: kpi.incidentes_sla_vencido ?? 0,
      ieiAcumulado:         kpi.iei_acumulado != null ? Number(kpi.iei_acumulado) : null,
      contratoSlaRespuesta: contrato?.sla_respuesta_min ?? null,
      contratoSlaResolucion: contrato?.sla_resolucion_min ?? null,
      periodo:              'Últimos 90 días',
    },
  })
}
