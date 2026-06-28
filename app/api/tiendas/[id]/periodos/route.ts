import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, fichas, incidentes, proveedores } from '@/drizzle/schema'
import { eq, and, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'

/**
 * Línea de tiempo de proveedores de una tienda + desempeño GLOBAL de cada uno.
 *
 * Un "periodo" = la gestión de un proveedor con esta tienda (agrupado por
 * proveedor_id). Las fechas salen de las fichas; las métricas se calculan sobre
 * TODOS los incidentes atribuidos a ese proveedor (sin ventana de 30d), usando
 * la misma fuente de verdad SLA que el resto del sistema (lib/sla-core).
 *
 * El proveedor actual de la tienda se marca esActual=true y fechaFin=null ("Actual").
 */

interface MetricasGlobales {
  totalIncidentes: number
  totalResueltos: number
  totalEvaluables: number
  scoreRespuestaPromedio: number | null
  tRespuestaPromedio: number | null
  scoreResolucionPromedio: number | null
  tResolucionPromedio: number | null
  mttrPromedio: number | null
  impactoEstimado: number | null
}

async function metricasGlobales(
  tiendaId: string,
  proveedorId: string,
  ventaHoraSoles: number | null,
  cluster: string | null,
): Promise<MetricasGlobales> {
  const base: MetricasGlobales = {
    totalIncidentes: 0, totalResueltos: 0, totalEvaluables: 0,
    scoreRespuestaPromedio: null, tRespuestaPromedio: null,
    scoreResolucionPromedio: null, tResolucionPromedio: null,
    mttrPromedio: null, impactoEstimado: null,
  }

  // Conteo total + MTTR promedio (sobre resueltos)
  try {
    const [c] = await db.execute(sql`
      SELECT count(*)::int AS total,
             round(avg(mttr_minutos) FILTER (WHERE estado = 'RESUELTO'))::int AS mttr_avg
      FROM incidentes
      WHERE tienda_id = ${tiendaId} AND proveedor_id = ${proveedorId}
    `) as any[]
    base.totalIncidentes = Number(c?.total ?? 0)
    base.mttrPromedio = c?.mttr_avg != null ? Number(c.mttr_avg) : null
  } catch (e) { logUnlessSchemaMissing('tiendas/[id]/periodos', e) }

  // SLA — misma lógica que el bloque 30d pero global y filtrado por proveedor
  try {
    const { calcSLARow } = await import('@/lib/sla-core')
    const slaRows = await db.execute(sql`
      SELECT i.tipo, i.hora_registro, i.hora_fin,
        n1.hora_correo_n1, resp.hora_primera_resp, max_n.max_nivel,
        contrato.sla_resp_override, contrato.sla_resol_override
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN LATERAL (
        SELECT MIN(hora_envio_correo) AS hora_correo_n1
        FROM escalamientos WHERE incidente_id = i.id AND hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM escalamientos WHERE incidente_id = i.id AND hora_respuesta IS NOT NULL AND no_hubo_respuesta IS NOT TRUE
        ORDER BY hora_respuesta LIMIT 1
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(MAX(nivel), 0) AS max_nivel
        FROM escalamientos WHERE incidente_id = i.id
      ) max_n ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla  AS sla_resp_override,
               tiempo_resolucion_sla AS sla_resol_override
        FROM fichas
        WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT 1
      ) contrato ON true
      WHERE i.tienda_id = ${tiendaId}
        AND i.proveedor_id = ${proveedorId}
        AND i.estado = 'RESUELTO'
        AND i.evaluable_proveedor IS NOT FALSE
    `) as any[]

    let totalEsc = 0, scoreRespSum = 0
    let scoreResolSum = 0, scoreResolCount = 0
    let tRespSum = 0, tRespCount = 0
    let tResolSum = 0, tResolCount = 0
    for (const row of slaRows) {
      if (!row.hora_correo_n1) continue
      const res = calcSLARow({
        tipo: row.tipo,
        hora_correo_n1: row.hora_correo_n1,
        hora_primera_resp: row.hora_primera_resp,
        hora_fin: row.hora_fin ?? null,
        hora_registro: row.hora_registro ?? null,
        max_nivel: row.max_nivel ?? 1,
        slaRespuestaOverride: row.sla_resp_override ?? undefined,
        slaResolucionOverride: row.sla_resol_override ?? undefined,
      })
      if (!res.evaluable) continue
      totalEsc++
      scoreRespSum += res.scoreRespuesta ?? 0
      // Sin respuesta (scoreResolucion=0 pero tResolucionMin=null) no cuenta para resolución
      if (res.scoreResolucion != null && res.tResolucionMin != null) { scoreResolSum += res.scoreResolucion; scoreResolCount++ }
      if (res.tPrimeraRespuestaMin != null) { tRespSum += res.tPrimeraRespuestaMin; tRespCount++ }
      if (res.tResolucionMin != null) { tResolSum += res.tResolucionMin; tResolCount++ }
    }
    base.totalResueltos = slaRows.length
    base.totalEvaluables = totalEsc
    base.scoreRespuestaPromedio  = totalEsc > 0 ? Math.round(scoreRespSum / totalEsc) : null
    base.tRespuestaPromedio      = tRespCount > 0 ? Math.round(tRespSum / tRespCount) : null
    base.scoreResolucionPromedio = scoreResolCount > 0 ? Math.round(scoreResolSum / scoreResolCount) : null
    base.tResolucionPromedio     = tResolCount > 0 ? Math.round(tResolSum / tResolCount) : null
  } catch (e) { logUnlessSchemaMissing('tiendas/[id]/periodos', e) }

  // Impacto estimado acumulado (sobre resueltos)
  try {
    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const impRows = await db.select({
      horaRegistro: incidentes.horaRegistro, horaFin: incidentes.horaFin,
      estado: incidentes.estado, tipo: incidentes.tipo,
      contActivadoPor: incidentes.contActivadoPor, contEsExterno: incidentes.contEsExterno,
      contRendimiento: incidentes.contRendimiento,
      movActivadoPor: incidentes.movActivadoPor, movRendimiento: incidentes.movRendimiento,
      boletaManual: incidentes.boletaManual, ventaParcial: incidentes.ventaParcial,
      cajasAfectadas: incidentes.cajasAfectadas, cajasTotales: incidentes.cajasTotales,
      otrosClasificacion: incidentes.otrosClasificacion,
    }).from(incidentes).where(and(
      eq(incidentes.tiendaId, tiendaId),
      eq(incidentes.proveedorId, proveedorId),
      eq(incidentes.estado, 'RESUELTO'),
    ))
    let suma = 0, tieneAlguno = false
    for (const inc of impRows) {
      const r = calcImpactoRow({
        hora_registro: inc.horaRegistro, hora_fin: inc.horaFin, estado: inc.estado, tipo: inc.tipo,
        venta_hora_soles: ventaHoraSoles, cluster,
        contingencia_activa: !!inc.contActivadoPor, cont_es_externo: !!inc.contEsExterno,
        cont_rendimiento: inc.contRendimiento,
        hubo_movil: !!inc.movActivadoPor, mov_rendimiento: inc.movRendimiento,
        boleta_manual: inc.boletaManual ?? false, venta_parcial: inc.ventaParcial ?? false,
        cajas_afectadas: inc.cajasAfectadas, cajas_totales: inc.cajasTotales,
        otros_clasificacion: inc.otrosClasificacion,
      })
      if (r.impactoEconomicoEstimado != null) { suma += r.impactoEconomicoEstimado; tieneAlguno = true }
    }
    if (tieneAlguno) base.impactoEstimado = suma
  } catch (e) { logUnlessSchemaMissing('tiendas/[id]/periodos', e) }

  return base
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [tienda] = await db.select({
    id: tiendas.id, proveedorId: tiendas.proveedorId,
    ventaHoraSoles: tiendas.ventaHoraSoles, cluster: tiendas.cluster,
  }).from(tiendas).where(eq(tiendas.id, id))
  if (!tienda) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  // Proveedores que tuvo la tienda: por fichas (con fechas) + por incidentes (por si alguno no tiene ficha)
  const fichaRows = await db.select({
    proveedorId: fichas.proveedorId, nombre: proveedores.nombre,
    estado: fichas.estado, fechaInicio: fichas.fechaInicio, fechaFin: fichas.fechaFin,
    activadoEn: fichas.activadoEn, archivadoEn: fichas.archivadoEn,
  }).from(fichas)
    .leftJoin(proveedores, eq(fichas.proveedorId, proveedores.id))
    .where(eq(fichas.tiendaId, id))

  const incProvRows = await db.execute(sql`
    SELECT DISTINCT i.proveedor_id, p.nombre
    FROM incidentes i JOIN proveedores p ON i.proveedor_id = p.id
    WHERE i.tienda_id = ${id} AND i.proveedor_id IS NOT NULL
  `) as any[]

  // Agrupar por proveedor
  const map = new Map<string, { proveedorId: string; nombre: string | null; fechaInicio: string | null; fechaFin: string | null }>()
  const setFecha = (provId: string, nombre: string | null, ini: string | null, fin: string | null) => {
    const cur = map.get(provId)
    if (!cur) { map.set(provId, { proveedorId: provId, nombre, fechaInicio: ini, fechaFin: fin }); return }
    if (nombre && !cur.nombre) cur.nombre = nombre
    if (ini && (!cur.fechaInicio || ini < cur.fechaInicio)) cur.fechaInicio = ini
    if (fin && (!cur.fechaFin || fin > cur.fechaFin)) cur.fechaFin = fin
  }
  for (const f of fichaRows) {
    if (!f.proveedorId) continue
    const ini = (f.fechaInicio as any) ?? (f.activadoEn ? new Date(f.activadoEn).toISOString().slice(0, 10) : null)
    const fin = (f.fechaFin as any) ?? (f.archivadoEn ? new Date(f.archivadoEn).toISOString().slice(0, 10) : null)
    setFecha(f.proveedorId, f.nombre, ini, fin)
  }
  for (const r of incProvRows) {
    if (!r.proveedor_id) continue
    setFecha(r.proveedor_id, r.nombre, null, null)
  }

  const ventaHoraSoles = tienda.ventaHoraSoles ? Number(tienda.ventaHoraSoles) : null
  const cluster = tienda.cluster ?? null

  const periodos = await Promise.all([...map.values()].map(async (p) => {
    const esActual = p.proveedorId === tienda.proveedorId
    const metricas = await metricasGlobales(id, p.proveedorId, ventaHoraSoles, cluster)
    return {
      proveedorId: p.proveedorId,
      nombre: p.nombre,
      fechaInicio: p.fechaInicio,
      fechaFin: esActual ? null : p.fechaFin,
      esActual,
      metricas,
    }
  }))

  // Actual primero; el resto por fecha de fin (o inicio) descendente
  periodos.sort((a, b) => {
    if (a.esActual !== b.esActual) return a.esActual ? -1 : 1
    const ka = a.fechaFin ?? a.fechaInicio ?? ''
    const kb = b.fechaFin ?? b.fechaInicio ?? ''
    return kb.localeCompare(ka)
  })

  return NextResponse.json(periodos)
}
