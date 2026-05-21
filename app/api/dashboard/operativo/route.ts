import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const SLA_MIN: Record<string, number> = {
  CAIDA_TOTAL: 60, INTERMITENCIA: 120, LENTITUD: 240, POS: 60, OTROS: 120,
}

function getEstadoOp(tipo: string, horaRegistro: Date | string, pendienteProveedor: boolean, estadoDB: string, nowMs: number) {
  const minutos = (nowMs - new Date(horaRegistro).getTime()) / 60000
  const slaLimite = SLA_MIN[tipo] ?? 240
  const pct = minutos / slaLimite
  let estadoOp: string
  if (pct >= 1.0) estadoOp = 'SLA_VENCIDO'
  else if (pct >= 0.7) estadoOp = 'EN_RIESGO_SLA'
  else if (pendienteProveedor) estadoOp = 'PENDIENTE_PROVEEDOR'
  else if (estadoDB.startsWith('ESCALADO')) estadoOp = 'ESCALADO'
  else estadoOp = 'ABIERTO'
  return { estadoOp, pctSla: Math.round(pct * 100), minutosTranscurridos: Math.round(minutos), slaLimite }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const nowMs = Date.now()
  const ahoraLima = new Date(Date.now() - 5 * 3600000)
  const hoyLima = ahoraLima.toISOString().slice(0, 10)
  const hoyIso = new Date(hoyLima + 'T05:00:00.000Z').toISOString()

  const [activosRows, resueltoRows, agentesRows, incCreadosRows, escRows, respRows, resolRows] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.estado,
        i.tipo,
        i.nivel_impacto,
        i.hora_registro,
        i.registrado_por_id           AS agente_id,
        u.nombre                      AS agente_nombre,
        t.id                          AS tienda_id,
        t.codigo                      AS tienda_codigo,
        t.nombre_cc                   AS tienda_nombre,
        t.distrito                    AS tienda_distrito,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
        EXISTS (
          SELECT 1 FROM escalamientos e2
          WHERE e2.incidente_id = i.id
            AND e2.hora_envio_correo IS NOT NULL
            AND e2.hora_respuesta    IS NULL
        ) AS pendiente_proveedor,
        mov.ultimo_movimiento
      FROM incidentes i
      JOIN tiendas   t ON i.tienda_id           = t.id
      JOIN usuarios  u ON i.registrado_por_id   = u.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
      LEFT JOIN LATERAL (
        SELECT GREATEST(
          MAX(e.creado_en),
          MAX(e.hora_envio_correo),
          MAX(e.hora_respuesta)
        ) AS ultimo_movimiento
        FROM escalamientos e
        WHERE e.incidente_id = i.id
      ) mov ON true
      WHERE i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      ORDER BY i.hora_registro ASC
    `),

    db.execute(sql`
      SELECT
        i.registrado_por_id AS agente_id,
        i.mttr_minutos,
        i.resuelto_por,
        i.resuelto_por = 'PROVEEDOR' AS por_proveedor
      FROM incidentes i
      WHERE i.estado  = 'RESUELTO'
        AND i.hora_fin >= ${hoyIso}::timestamptz
    `),

    db.execute(sql`
      SELECT id, nombre, rol FROM usuarios
      WHERE activo = true AND rol IN ('AGENTE','SUPERVISOR')
      ORDER BY nombre
    `),

    db.execute(sql`
      SELECT 'CREADO' AS tipo_evento, i.id, i.codigo,
             i.hora_registro AS hora, u.nombre AS actor, NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i JOIN usuarios u ON i.registrado_por_id = u.id
      WHERE i.hora_registro >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_registro DESC LIMIT 15
    `),

    db.execute(sql`
      SELECT 'ESCALADO' AS tipo_evento, i.id, i.codigo,
             e.hora_envio_correo AS hora, u.nombre AS actor,
             COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre, e.nivel
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id   = i.id
      JOIN tiendas    t ON i.tienda_id      = t.id
      JOIN usuarios   u ON i.registrado_por_id = u.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
      WHERE e.hora_envio_correo IS NOT NULL
        AND e.hora_envio_correo >= NOW() - INTERVAL '24 hours'
      ORDER BY e.hora_envio_correo DESC LIMIT 15
    `),

    db.execute(sql`
      SELECT 'RESPUESTA_PROVEEDOR' AS tipo_evento, i.id, i.codigo,
             e.hora_respuesta AS hora, u.nombre AS actor,
             COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre, NULL::int AS nivel
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id      = i.id
      JOIN tiendas    t ON i.tienda_id         = t.id
      JOIN usuarios   u ON i.registrado_por_id = u.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
      WHERE e.hora_respuesta IS NOT NULL
        AND e.hora_respuesta >= NOW() - INTERVAL '24 hours'
      ORDER BY e.hora_respuesta DESC LIMIT 10
    `),

    db.execute(sql`
      SELECT 'RESUELTO' AS tipo_evento, i.id, i.codigo,
             i.hora_fin AS hora, u.nombre AS actor, NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i JOIN usuarios u ON i.registrado_por_id = u.id
      WHERE i.estado = 'RESUELTO'
        AND i.hora_fin IS NOT NULL
        AND i.hora_fin >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_fin DESC LIMIT 15
    `),
  ])

  const activos   = activosRows  as any[]
  const resueltos = resueltoRows as any[]
  const agentes   = agentesRows  as any[]

  const activosConEstado = activos.map((inc: any) => {
    const d = getEstadoOp(inc.tipo, inc.hora_registro, inc.pendiente_proveedor, inc.estado, nowMs)
    const refMs = inc.ultimo_movimiento
      ? new Date(inc.ultimo_movimiento).getTime()
      : new Date(inc.hora_registro).getTime()
    const sinMovimientoMin = Math.round((nowMs - refMs) / 60000)
    return { ...inc, ...d, sinMovimientoMin, sinMovimiento: sinMovimientoMin > 120 }
  })

  // KPIs
  const resueltoHoy          = resueltos.length
  const resueltoHoyProveedor = resueltos.filter((r: any) => r.por_proveedor).length
  const resueltoHoyAgente    = resueltoHoy - resueltoHoyProveedor

  // Team stats
  const equipoStats = agentes.map((ag: any) => {
    const misIncs     = activosConEstado.filter((i: any) => i.agente_id === ag.id)
    const misRes      = resueltos.filter((r: any) => r.agente_id === ag.id)
    const mttrAgenteArr   = misRes.filter((r: any) => r.resuelto_por === 'AGENTE'    && r.mttr_minutos != null).map((r: any) => r.mttr_minutos as number)
    const mttrProvArr     = misRes.filter((r: any) => r.resuelto_por === 'PROVEEDOR' && r.mttr_minutos != null).map((r: any) => r.mttr_minutos as number)
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null
    return {
      id: ag.id, nombre: ag.nombre, rol: ag.rol,
      casosActivos:         misIncs.length,
      enRiesgoSla:          misIncs.filter((i: any) => ['EN_RIESGO_SLA','SLA_VENCIDO'].includes(i.estadoOp)).length,
      escalados:            misIncs.filter((i: any) => i.estado.startsWith('ESCALADO')).length,
      pendientesProveedor:  misIncs.filter((i: any) => i.pendiente_proveedor).length,
      resueltoHoyAgente:    misRes.filter((r: any) => !r.por_proveedor).length,
      resueltoHoyProveedor: misRes.filter((r: any) =>  r.por_proveedor).length,
      mttrPromedioAgente:   avg(mttrAgenteArr),
      mttrPromedioProveedor: avg(mttrProvArr),
    }
  })

  // Provider pending summary
  const provPendMap = new Map<string, { count: number; oldest: number }>()
  for (const inc of activosConEstado) {
    if (!inc.pendiente_proveedor) continue
    const prov  = inc.proveedor_nombre ?? 'OTROS'
    const horaMs = new Date(inc.hora_registro).getTime()
    if (!provPendMap.has(prov)) provPendMap.set(prov, { count: 0, oldest: horaMs })
    const e = provPendMap.get(prov)!
    e.count++
    if (horaMs < e.oldest) e.oldest = horaMs
  }
  const proveedoresPendientes = [...provPendMap.entries()]
    .map(([nombre, { count, oldest }]) => ({
      nombre, count,
      masAntiguoMin: Math.round((nowMs - oldest) / 60000),
    }))
    .sort((a, b) => b.count - a.count)

  // Merge activity
  const actividadReciente = [
    ...(incCreadosRows as any[]),
    ...(escRows        as any[]),
    ...(respRows       as any[]),
    ...(resolRows      as any[]),
  ]
    .filter((a) => a.hora != null)
    .sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime())
    .slice(0, 25)

  return NextResponse.json({
    activos: activosConEstado,
    equipoStats,
    proveedoresPendientes,
    actividadReciente,
    kpis: {
      abiertos:             activos.length,
      enRiesgoSla:          activosConEstado.filter((i: any) => ['EN_RIESGO_SLA','SLA_VENCIDO'].includes(i.estadoOp)).length,
      vencidoSla:           activosConEstado.filter((i: any) => i.estadoOp === 'SLA_VENCIDO').length,
      escalados:            activosConEstado.filter((i: any) => i.estado.startsWith('ESCALADO')).length,
      pendientesProveedor:  activosConEstado.filter((i: any) => i.pendiente_proveedor).length,
      resueltoHoy, resueltoHoyAgente, resueltoHoyProveedor,
      agentesEnGestion: equipoStats.filter((a: any) => a.casosActivos > 0).length,
      totalAgentes:     agentes.length,
    },
  })
}
