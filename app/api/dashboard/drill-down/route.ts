import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { calcSLARow } from '@/lib/sla-core'

function minBetween(a: Date | string | null, b: Date | string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

function fmtLima(d: Date | string | null): string | null {
  if (!d) return null
  return new Date(d).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

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
      COALESCE(p.nombre, pt.nombre)             AS prov_nombre,
      t.codigo                                   AS tienda_codigo,
      t.nombre_cc                                AS tienda_nombre,
      t.distrito                                 AS tienda_distrito,
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.mttr_minutos,
      i.evaluable_proveedor,
      e1.hora_envio_correo,
      e1.hora_respuesta,
      COALESCE(e1.no_hubo_respuesta, false)      AS no_hubo_respuesta,
      COALESCE(max_n.max_nivel, 0)               AS max_nivel
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo, hora_respuesta, no_hubo_respuesta
      FROM   escalamientos
      WHERE  incidente_id = i.id AND nivel = 1
      ORDER  BY creado_en LIMIT 1
    ) e1 ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(MAX(nivel), 0) AS max_nivel
      FROM   escalamientos
      WHERE  incidente_id = i.id
    ) max_n ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
    ORDER BY COALESCE(p.nombre, pt.nombre) NULLS LAST, t.codigo, i.hora_registro DESC
  `)

  type Row = {
    prov_nombre: string | null
    tienda_codigo: string
    tienda_nombre: string | null
    tienda_distrito: string | null
    id: string
    codigo: string
    tipo: string
    hora_registro: Date
    hora_fin: Date | null
    mttr_minutos: number | null
    evaluable_proveedor: boolean | null
    hora_envio_correo: Date | null
    hora_respuesta: Date | null
    no_hubo_respuesta: boolean
    max_nivel: number
  }

  const all = rows as unknown as Row[]

  // Group: provider → store → incidents
  const provMap = new Map<string, Map<string, Row[]>>()
  for (const row of all) {
    const prov = row.prov_nombre ?? '(Sin proveedor)'
    if (!provMap.has(prov)) provMap.set(prov, new Map())
    const tm = provMap.get(prov)!
    if (!tm.has(row.tienda_codigo)) tm.set(row.tienda_codigo, [])
    tm.get(row.tienda_codigo)!.push(row)
  }

  const proveedores = [...provMap.entries()].map(([provNombre, tiendaMap]) => {
    const tiendas = [...tiendaMap.entries()].map(([tiendaCodigo, incRows]) => {
      const mttrVals = incRows.filter(r => r.mttr_minutos && r.mttr_minutos > 0).map(r => r.mttr_minutos!)
      const mttrAvg = mttrVals.length ? Math.round(mttrVals.reduce((a, b) => a + b) / mttrVals.length) : null

      const slaCalcs = incRows
        .filter(r => r.evaluable_proveedor !== false)
        .map(r => calcSLARow({ tipo: r.tipo, hora_correo_n1: r.hora_envio_correo, hora_primera_resp: r.hora_respuesta, hora_fin: r.hora_fin, max_nivel: r.max_nivel }))
      const evaluables = slaCalcs.filter(s => s.evaluable)
      const slaOk   = evaluables.filter(s => s.slaGeneral).length
      const slaFail = evaluables.length - slaOk

      const incidentes = incRows.map(r => {
        const minHastaEnvio          = minBetween(r.hora_registro, r.hora_envio_correo)
        const minRespuesta           = minBetween(r.hora_envio_correo, r.hora_respuesta)
        const minSolucionDesdeCorreo = minBetween(r.hora_envio_correo, r.hora_fin)

        let dentroSLA: boolean | null = null
        if (r.evaluable_proveedor !== false) {
          const sla = calcSLARow({ tipo: r.tipo, hora_correo_n1: r.hora_envio_correo, hora_primera_resp: r.hora_respuesta, hora_fin: r.hora_fin, max_nivel: r.max_nivel })
          if (sla.evaluable) dentroSLA = sla.slaGeneral
        }

        return {
          id: r.id,
          codigo: r.codigo,
          tipo: r.tipo,
          horaInicio:             fmtLima(r.hora_registro),
          horaRegistroMs:         r.hora_registro ? new Date(r.hora_registro).getTime() : null,
          horaFin:                fmtLima(r.hora_fin),
          mttrMin:                r.mttr_minutos,
          horaEnvioN1:            fmtLima(r.hora_envio_correo),
          horaRespuesta:          fmtLima(r.hora_respuesta),
          noHuboRespuesta:        r.no_hubo_respuesta,
          evaluableProveedor:     r.evaluable_proveedor !== false,
          minHastaEnvio,
          minRespuesta,
          minSolucionDesdeCorreo,
          dentroSLA,
        }
      })

      return {
        codigo: tiendaCodigo,
        nombre: incRows[0].tienda_nombre ?? tiendaCodigo,
        distrito: incRows[0].tienda_distrito,
        mttrAvg,
        incidentesCount: incRows.length,
        slaOk,
        slaFail,
        incidentes,
      }
    }).sort((a, b) => (b.slaFail - a.slaFail) || ((b.mttrAvg ?? 0) - (a.mttrAvg ?? 0)))

    const allRows    = [...tiendaMap.values()].flat()
    const allSlaCalcs = allRows
      .filter(r => r.evaluable_proveedor !== false)
      .map(r => calcSLARow({ tipo: r.tipo, hora_correo_n1: r.hora_envio_correo, hora_primera_resp: r.hora_respuesta, hora_fin: r.hora_fin, max_nivel: r.max_nivel }))
    const evs        = allSlaCalcs.filter(s => s.evaluable)
    const dentroSLAn = evs.filter(s => s.slaGeneral).length
    const slaPct     = evs.length > 0 ? Math.round(dentroSLAn / evs.length * 100) : null
    const mttrVals   = allRows.filter(r => r.mttr_minutos && r.mttr_minutos > 0).map(r => r.mttr_minutos!)
    const mttrAvg    = mttrVals.length ? Math.round(mttrVals.reduce((a, b) => a + b) / mttrVals.length) : null

    return { nombre: provNombre, slaPct, mttrAvg, incidentesCount: allRows.length, tiendas }
  })

  return NextResponse.json({ proveedores })
}
