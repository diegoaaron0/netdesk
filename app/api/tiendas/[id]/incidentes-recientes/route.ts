import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { calcImpactoRow } from '@/lib/impacto-calc'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await db.execute(sql`
    SELECT
      i.id, i.codigo, i.tipo, i.estado, i.mttr_minutos,
      i.hora_registro, i.hora_fin,
      i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
      i.mov_hora_activacion,  i.mov_hora_desactivacion,  i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.tienda_id = ${id}
      AND i.estado != 'CANCELADO'
    ORDER BY i.hora_registro DESC
    LIMIT 10
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
    })
    return {
      id:            r.id,
      codigo:        r.codigo,
      tipo:          r.tipo,
      estado:        r.estado,
      mttr_minutos:  r.mttr_minutos,
      hora_registro: r.hora_registro,
      hora_fin:      r.hora_fin,
      iei:           iei.impactoEconomicoEstimado,
      ieiFalta:      iei.faltaInformacion,
      ieiMotivo:     iei.motivoFactor,
    }
  })

  // IEI acumulado últimos 30 días (todos los resueltos, no solo los 10 de la tabla)
  const iei30dRows = await db.execute(sql`
    SELECT
      i.id, i.codigo, i.hora_registro, i.hora_fin, i.estado, i.tipo, i.mttr_minutos,
      i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
      i.mov_hora_activacion,  i.mov_hora_desactivacion,  i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.tienda_id = ${id}
      AND i.estado = 'RESUELTO'
      AND i.hora_registro >= NOW() - INTERVAL '30 days'
  `)

  let iei30d = 0
  for (const r of iei30dRows as any[]) {
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
    })
    iei30d += res.impactoEstimado
  }

  // Lista completa para panel de desglose (todos los resueltos 30d con IEI)
  const breakdown = (iei30dRows as any[])
    .map(r => {
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
      })
      return {
        id:           r.id,
        codigo:       r.codigo,
        tipo:         r.tipo,
        mttrMinutos:  r.mttr_minutos,
        horaRegistro: r.hora_registro,
        iei:          res.impactoEstimado,
        motivo:       res.motivoFactor,
      }
    })
    .filter(r => r.iei > 0)
    .sort((a, b) => b.iei - a.iei)

  return NextResponse.json({ incidentes: result, iei30d: Math.round(iei30d), iei30dBreakdown: breakdown })
}
