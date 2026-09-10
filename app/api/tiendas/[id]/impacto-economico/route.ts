import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getTramosPorIncidentes, calcIeiIncidente, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

const MOTIVO_LABEL: Record<string, string> = {
  ROUTER_PROPIO: 'router propio', ROUTER_EXTERNO: 'router externo',
  DATOS_MOVILES: 'datos móviles', BOLETA_MANUAL: 'boleta manual',
}
function motivoDeSegmentos(segmentos: { tipo: string }[]): string {
  const tipos = [...new Set(segmentos.filter(s => s.tipo !== 'SIN_MITIGACION').map(s => s.tipo))]
  return tipos.length > 0 ? tipos.map(t => MOTIVO_LABEL[t] ?? t).join(' + ') : 'sin mitigación'
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : (() => { const d = new Date(); d.setDate(1); d.setHours(5, 0, 0, 0); return d.toISOString() })()

  const rows = await db.execute(sql`
    SELECT
      i.id, i.codigo, i.tipo, i.estado, i.mttr_minutos,
      (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
      (i.hora_fin       AT TIME ZONE 'UTC') AS hora_fin,
      i.cont_activado_por,
      (i.cont_hora_activacion    AT TIME ZONE 'UTC') AS cont_hora_activacion,
      (i.cont_hora_desactivacion AT TIME ZONE 'UTC') AS cont_hora_desactivacion,
      i.cont_rendimiento, i.cont_es_externo,
      i.mov_activado_por,
      (i.mov_hora_activacion    AT TIME ZONE 'UTC') AS mov_hora_activacion,
      (i.mov_hora_desactivacion AT TIME ZONE 'UTC') AS mov_hora_desactivacion,
      i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento,
      (i.boleta_hora_activacion AT TIME ZONE 'UTC') AS boleta_hora_activacion,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster,
      COALESCE(p.nombre, pt.nombre) AS prov_nombre
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    WHERE i.tienda_id = ${id}
      AND i.estado != 'CANCELADO'
      AND i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
    ORDER BY i.hora_registro DESC
  `)

  const tramosDeRows = await getTramosPorIncidentes((rows as any[]).map(r => r.id))

  const result = (rows as any[]).map(r => {
    const incidenteMitigacion: IncidenteMitigacionInput = {
      tipo: r.tipo, estado: r.estado, horaRegistro: r.hora_registro, horaFin: r.hora_fin,
      // Ambos necesitan su activado_por, no solo el timestamp — bug real
      // confirmado en producción: un timestamp fantasma (sin activado_por)
      // se contaba como mitigación activa.
      contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
      contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
      movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
      movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
      boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
    }
    const tramos = tramosDeRows.get(r.id) ?? []
    const { iei, segmentos } = calcIeiIncidente(incidenteMitigacion, tramos, {
      ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles, cluster: r.cluster,
    })
    return {
      id:            r.id,
      codigo:        r.codigo,
      tipo:          r.tipo,
      estado:        r.estado,
      mttr_minutos:  r.mttr_minutos,
      hora_registro: r.hora_registro,
      hora_fin:      r.hora_fin,
      prov_nombre:   r.prov_nombre ?? null,
      iei,
      ieiFalta:      r.estado !== 'RESUELTO' || !r.hora_fin,
      ieiMotivo:     motivoDeSegmentos(segmentos),
    }
  })

  // IEI acumulado del período (todos los resueltos en el rango)
  const ieiRows = await db.execute(sql`
    SELECT
      i.id, i.codigo,
      (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
      (i.hora_fin       AT TIME ZONE 'UTC') AS hora_fin,
      i.estado, i.tipo, i.mttr_minutos,
      i.cont_activado_por,
      (i.cont_hora_activacion    AT TIME ZONE 'UTC') AS cont_hora_activacion,
      (i.cont_hora_desactivacion AT TIME ZONE 'UTC') AS cont_hora_desactivacion,
      i.cont_rendimiento, i.cont_es_externo,
      i.mov_activado_por,
      (i.mov_hora_activacion    AT TIME ZONE 'UTC') AS mov_hora_activacion,
      (i.mov_hora_desactivacion AT TIME ZONE 'UTC') AS mov_hora_desactivacion,
      i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento,
      (i.boleta_hora_activacion AT TIME ZONE 'UTC') AS boleta_hora_activacion,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.tienda_id = ${id}
      AND i.estado = 'RESUELTO'
      AND i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
  `)

  const tramosDeIeiRows = await getTramosPorIncidentes((ieiRows as any[]).map(r => r.id))

  let ieiTotal = 0
  const breakdownAll: any[] = []
  for (const r of ieiRows as any[]) {
    const incidenteMitigacion: IncidenteMitigacionInput = {
      tipo: r.tipo, estado: r.estado, horaRegistro: r.hora_registro, horaFin: r.hora_fin,
      contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
      contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
      movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
      movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
      boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
    }
    const tramos = tramosDeIeiRows.get(r.id) ?? []
    const { iei, segmentos } = calcIeiIncidente(incidenteMitigacion, tramos, {
      ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles, cluster: r.cluster,
    })
    ieiTotal += iei
    breakdownAll.push({
      id:           r.id,
      codigo:       r.codigo,
      tipo:         r.tipo,
      mttrMinutos:  r.mttr_minutos,
      horaRegistro: r.hora_registro,
      iei,
      motivo:       motivoDeSegmentos(segmentos),
    })
  }
  const breakdown = breakdownAll.filter(r => r.iei > 0).sort((a, b) => b.iei - a.iei)

  return NextResponse.json({ incidentes: result, iei30d: Math.round(ieiTotal), iei30dBreakdown: breakdown })
}
