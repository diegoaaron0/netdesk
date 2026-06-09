import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { calcImpactoRow } from '@/lib/impacto-calc'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      i.hora_registro, i.hora_fin,
      i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
      i.mov_hora_activacion,  i.mov_hora_desactivacion,  i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion,
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

  const result = (rows as any[]).map(r => {
    const iei = calcImpactoRow({
      hora_registro:           r.hora_registro,
      hora_fin:                r.hora_fin,
      estado:                  r.estado,
      tipo:                    r.tipo,
      venta_hora_soles:        r.venta_hora_soles,
      venta_hora_fds_soles:    r.venta_hora_fds_soles,
      cluster:                 r.cluster,
      cont_hora_activacion:    r.cont_hora_activacion,
      cont_hora_desactivacion: r.cont_hora_desactivacion,
      cont_rendimiento:        r.cont_rendimiento,
      cont_es_externo:         r.cont_es_externo,
      mov_hora_activacion:     r.mov_hora_activacion,
      mov_hora_desactivacion:  r.mov_hora_desactivacion,
      mov_rendimiento:         r.mov_rendimiento,
      boleta_manual:           r.boleta_manual,
      boleta_rendimiento:      r.boleta_rendimiento,
      boleta_hora_activacion:  r.boleta_hora_activacion,
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
      iei:           iei.impactoEstimado,
      ieiFalta:      iei.faltaInformacion,
      ieiMotivo:     iei.motivoFactor,
    }
  })

  // IEI acumulado del período (todos los resueltos en el rango)
  const ieiRows = await db.execute(sql`
    SELECT
      i.id, i.codigo, i.hora_registro, i.hora_fin, i.estado, i.tipo, i.mttr_minutos,
      i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
      i.mov_hora_activacion,  i.mov_hora_desactivacion,  i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.tienda_id = ${id}
      AND i.estado = 'RESUELTO'
      AND i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
  `)

  let ieiTotal = 0
  const breakdownAll: any[] = []
  for (const r of ieiRows as any[]) {
    const res = calcImpactoRow({
      hora_registro: r.hora_registro, hora_fin: r.hora_fin,
      estado: r.estado, tipo: r.tipo,
      venta_hora_soles: r.venta_hora_soles, venta_hora_fds_soles: r.venta_hora_fds_soles,
      cluster: r.cluster,
      cont_hora_activacion: r.cont_hora_activacion, cont_hora_desactivacion: r.cont_hora_desactivacion,
      cont_rendimiento: r.cont_rendimiento, cont_es_externo: r.cont_es_externo,
      mov_hora_activacion: r.mov_hora_activacion, mov_hora_desactivacion: r.mov_hora_desactivacion,
      mov_rendimiento: r.mov_rendimiento,
      boleta_manual: r.boleta_manual, boleta_rendimiento: r.boleta_rendimiento,
      boleta_hora_activacion: r.boleta_hora_activacion,
    })
    ieiTotal += res.impactoEstimado
    breakdownAll.push({
      id:           r.id,
      codigo:       r.codigo,
      tipo:         r.tipo,
      mttrMinutos:  r.mttr_minutos,
      horaRegistro: r.hora_registro,
      iei:          res.impactoEstimado,
      motivo:       res.motivoFactor,
    })
  }
  const breakdown = breakdownAll.filter(r => r.iei > 0).sort((a, b) => b.iei - a.iei)

  return NextResponse.json({ incidentes: result, iei30d: Math.round(ieiTotal), iei30dBreakdown: breakdown })
}
