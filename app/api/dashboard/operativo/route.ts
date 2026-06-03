import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getSlaLimitePorTipo } from '@/lib/sla-core'

function getEstadoOp(tipo: string, horaRegistro: Date | string, pendienteProveedor: boolean, estadoDB: string, nowMs: number) {
  const minutos = (nowMs - new Date(horaRegistro).getTime()) / 60000
  const slaLimite = getSlaLimitePorTipo(tipo)
  const pct = minutos / slaLimite
  let estadoOp: string
  if (pct >= 1.0) estadoOp = 'SLA_VENCIDO'
  else if (pct >= 0.7) estadoOp = 'EN_RIESGO_SLA'
  else if (pendienteProveedor) estadoOp = 'PENDIENTE_PROVEEDOR'
  else if (estadoDB.startsWith('ESCALADO')) estadoOp = 'ESCALADO'
  else estadoOp = 'ABIERTO'
  return { estadoOp, pctSla: Math.round(pct * 100), minutosTranscurridos: Math.round(minutos), slaLimite }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const nowMs = Date.now()
  const ahoraLima  = new Date(Date.now() - 5 * 3600000)
  const hoyLima    = ahoraLima.toISOString().slice(0, 10)
  const fechaParam = req.nextUrl.searchParams.get('fecha')
  const fechaLima  = fechaParam ?? hoyLima
  const isToday    = fechaLima === hoyLima

  const diaIso     = fechaLima + 'T05:00:00.000Z'   // start of Lima day in UTC
  const [y, m, d]  = fechaLima.split('-').map(Number)
  const siguienteIso = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0, 0)).toISOString()

  const [activosRows, resueltoRows, agentesRows, incCreadosRows, escRows, respRows, resolRows, canceladosRows, cerradosRows, contRows, creadosHoyRows, contStandaloneRows, movRows, boletaRows, contActRows] = await Promise.all([
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
        t.cluster                     AS tienda_cluster,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
        EXISTS (
          SELECT 1 FROM escalamientos e2
          WHERE e2.incidente_id = i.id
            AND e2.hora_envio_correo IS NOT NULL
            AND e2.hora_respuesta    IS NULL
        ) AS pendiente_proveedor,
        i.motivo_reabertura,
        i.cont_activado_por,
        i.cont_hora_activacion,
        i.cont_hora_desactivacion,
        i.cont_rendimiento,
        i.cont_es_externo,
        i.mov_hora_activacion,
        i.mov_hora_desactivacion,
        i.mov_rendimiento,
        i.boleta_manual,
        i.boleta_rendimiento,
        i.boleta_hora_activacion,
        i.escalado_infra_id,
        i.hora_escalado_infra,
        infra_u.nombre AS infra_nombre,
        mov.ultimo_movimiento,
        i.grupo_masivo_id,
        gm.codigo  AS grupo_masivo_codigo,
        gm.razon   AS grupo_masivo_razon,
        -- venta/hora según día de semana del incidente (0=dom,5=vie,6=sab = FDS)
        CASE
          WHEN EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'America/Lima') IN (0,5,6)
          THEN COALESCE(t.venta_hora_fds_soles, t.venta_hora_soles)
          ELSE COALESCE(t.venta_hora_soles, t.venta_hora_fds_soles)
        END AS iei_venta_hora
      FROM incidentes i
      JOIN tiendas   t ON i.tienda_id           = t.id
      JOIN usuarios  u ON i.registrado_por_id   = u.id
      LEFT JOIN usuarios infra_u ON i.escalado_infra_id = infra_u.id
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
      LEFT JOIN grupos_masivos gm ON i.grupo_masivo_id = gm.id
      WHERE ${isToday
        ? sql`i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
        : sql`i.hora_registro >= ${diaIso}::timestamptz AND i.hora_registro < ${siguienteIso}::timestamptz AND i.estado NOT IN ('CANCELADO','CERRADO')`
      }
      ORDER BY i.hora_registro ASC
    `),

    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.nivel_impacto,
        i.hora_registro,
        i.hora_fin,
        i.mttr_minutos,
        i.resuelto_por,
        i.resuelto_por = 'PROVEEDOR' AS por_proveedor,
        i.registrado_por_id AS agente_id,
        u.nombre AS agente_nombre,
        t.codigo AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        t.distrito AS tienda_distrito,
        t.cluster  AS tienda_cluster,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre
      FROM incidentes i
      JOIN usuarios u ON i.registrado_por_id = u.id
      JOIN tiendas  t ON i.tienda_id         = t.id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.estado  = 'RESUELTO'
        AND i.hora_fin >= ${diaIso}::timestamptz
        ${!isToday ? sql`AND i.hora_fin < ${siguienteIso}::timestamptz` : sql``}
      ORDER BY i.hora_fin DESC
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
             e.hora_envio_correo AS hora,
             COALESCE(ue.nombre, u.nombre) AS actor,
             COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre, e.nivel
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id      = i.id
      JOIN tiendas    t ON i.tienda_id         = t.id
      JOIN usuarios   u ON i.registrado_por_id = u.id
      LEFT JOIN usuarios ue ON e.creado_por_id = ue.id
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
             i.hora_fin AS hora,
             COALESCE(ur.nombre, u.nombre) AS actor,
             i.resuelto_por,
             NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i
      JOIN usuarios u ON i.registrado_por_id = u.id
      LEFT JOIN usuarios ur ON i.resuelto_por_usuario_id = ur.id
      WHERE i.estado = 'RESUELTO'
        AND i.hora_fin IS NOT NULL
        AND i.hora_fin >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_fin DESC LIMIT 15
    `),

    db.execute(sql`
      SELECT 'CANCELADO' AS tipo_evento, i.id, i.codigo,
             i.hora_fin AS hora,
             COALESCE(uc.nombre, u.nombre) AS actor,
             NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i
      JOIN usuarios u ON i.registrado_por_id = u.id
      LEFT JOIN usuarios uc ON i.cancelado_por_id = uc.id
      WHERE i.estado = 'CANCELADO'
        AND i.hora_fin IS NOT NULL
        AND i.hora_fin >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_fin DESC LIMIT 10
    `),

    db.execute(sql`
      SELECT 'CERRADO' AS tipo_evento, i.id, i.codigo,
             i.hora_fin AS hora,
             COALESCE(ucr.nombre, u.nombre) AS actor,
             NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i
      JOIN usuarios u ON i.registrado_por_id = u.id
      LEFT JOIN usuarios ucr ON i.cerrado_por_id = ucr.id
      WHERE i.estado = 'CERRADO'
        AND i.hora_fin IS NOT NULL
        AND i.hora_fin >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_fin DESC LIMIT 10
    `),

    db.execute(sql`
      SELECT DISTINCT ON (t.id)
        t.id             AS tienda_id,
        t.codigo         AS tienda_codigo,
        t.nombre_cc      AS tienda_nombre,
        t.distrito       AS tienda_distrito,
        t.contingencia_descripcion,
        t.contingencia_activada_por,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
        i.id             AS incidente_id,
        i.codigo         AS incidente_codigo,
        i.cont_hora_activacion,
        i.cont_rendimiento,
        i.cont_observacion,
        i.cont_es_externo
      FROM tiendas t
      LEFT JOIN incidentes i ON i.tienda_id = t.id
        AND i.cont_activado_por IS NOT NULL
        AND i.cont_hora_desactivacion IS NULL
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE t.contingencia_activa = true
      ORDER BY t.id, i.cont_hora_activacion ASC NULLS LAST
    `),

    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM incidentes
      WHERE hora_registro >= ${diaIso}::timestamptz
    `),

    db.execute(sql`
      SELECT
        c.id            AS contingencia_id,
        c.tipo,
        c.activado_por,
        c.hora_activacion,
        c.justificacion,
        t.id            AS tienda_id,
        t.codigo        AS tienda_codigo,
        t.nombre_cc     AS tienda_nombre,
        t.distrito      AS tienda_distrito,
        COALESCE(pt.nombre) AS proveedor_nombre
      FROM contingencias c
      JOIN tiendas t ON c.tienda_id = t.id
      LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
      WHERE c.hora_desactivacion IS NULL
      ORDER BY c.hora_activacion ASC
    `),

    db.execute(sql`
      SELECT
        i.id                           AS incidente_id,
        i.codigo                       AS incidente_codigo,
        i.mov_hora_activacion          AS cont_hora_activacion,
        t.id                           AS tienda_id,
        t.codigo                       AS tienda_codigo,
        t.nombre_cc                    AS tienda_nombre,
        t.distrito                     AS tienda_distrito,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre
      FROM incidentes i
      JOIN tiendas t ON t.id = i.tienda_id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.mov_activado_por IS NOT NULL
        AND i.mov_hora_desactivacion IS NULL
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      ORDER BY i.mov_hora_activacion ASC
    `),

    db.execute(sql`
      SELECT
        i.id                           AS incidente_id,
        i.codigo                       AS incidente_codigo,
        i.boleta_hora_activacion       AS cont_hora_activacion,
        i.boleta_rendimiento,
        t.id                           AS tienda_id,
        t.codigo                       AS tienda_codigo,
        t.nombre_cc                    AS tienda_nombre,
        t.distrito                     AS tienda_distrito,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre
      FROM incidentes i
      JOIN tiendas t ON t.id = i.tienda_id
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      WHERE i.boleta_manual = true
        AND i.boleta_hora_activacion IS NOT NULL
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      ORDER BY i.boleta_hora_activacion ASC
    `),

    // ── Activaciones de contingencia (últimas 24h) para actividad reciente ──────
    db.execute(sql`
      SELECT tipo_evento, id, codigo, hora, actor, proveedor_nombre, NULL::int AS nivel FROM (
        SELECT 'CONTINGENCIA'::text AS tipo_evento, i.id::text AS id, i.codigo,
               i.cont_hora_activacion AS hora, i.cont_activado_por AS actor,
               COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.cont_hora_activacion IS NOT NULL
          AND i.cont_hora_activacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        SELECT 'CONTINGENCIA'::text, i.id::text, i.codigo,
               i.mov_hora_activacion, i.mov_activado_por,
               COALESCE(pi.nombre, pt.nombre)
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.mov_hora_activacion IS NOT NULL
          AND i.mov_hora_activacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        SELECT 'CONTINGENCIA'::text, NULL::text, t.codigo,
               c.hora_activacion, c.activado_por,
               COALESCE(pt.nombre)
        FROM contingencias c
        JOIN tiendas t ON c.tienda_id = t.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE c.hora_activacion >= NOW() - INTERVAL '24 hours'
      ) sub
      ORDER BY hora DESC LIMIT 20
    `),
  ])

  const activos  = activosRows as any[]
  const resueltos = resueltoRows as any[]
  const agentes   = agentesRows as any[]

  const contInc = (contRows as any[]).map((c: any) => ({
    ...c,
    fuente: 'INCIDENTE',
    tipo_contingencia: c.cont_es_externo ? 'ROUTER_EXTERNO' : 'ROUTER_PROPIO',
  }))
  const contMov = (movRows as any[]).map((c: any) => ({
    ...c,
    fuente: 'INCIDENTE',
    tipo_contingencia: 'DATOS_MOVILES',
    cont_es_externo: false,
  }))
  const contStd = (contStandaloneRows as any[]).map((c: any) => ({
    ...c,
    cont_hora_activacion: c.hora_activacion,
    cont_es_externo: c.tipo === 'ROUTER_EXTERNO',
    tipo_contingencia: c.tipo,
    incidente_id: null,
    incidente_codigo: null,
    fuente: 'STANDALONE',
  }))
  const contBoleta = (boletaRows as any[]).map((c: any) => ({
    ...c,
    fuente: 'INCIDENTE',
    tipo_contingencia: 'BOLETA_MANUAL',
    cont_es_externo: false,
  }))
  const contingenciasActivas = [...contInc, ...contMov, ...contBoleta, ...contStd]
    .sort((a: any, b: any) => new Date(a.cont_hora_activacion ?? a.hora_activacion).getTime() - new Date(b.cont_hora_activacion ?? b.hora_activacion).getTime())

  const activosConEstado = activos.map((inc: any) => {
    const d = getEstadoOp(inc.tipo, inc.hora_registro, inc.pendiente_proveedor, inc.estado, nowMs)
    const refMs = inc.ultimo_movimiento
      ? new Date(inc.ultimo_movimiento).getTime()
      : new Date(inc.hora_registro).getTime()
    const sinMovimientoMin = Math.round((nowMs - refMs) / 60000)
    return { ...inc, ...d, sinMovimientoMin, sinMovimiento: sinMovimientoMin > 120 }
  })

  // KPIs masivos
  const masivosActivos = activosConEstado.filter((i: any) => i.grupo_masivo_id).length
  const gruposMasivosActivos = new Set(activosConEstado.filter((i: any) => i.grupo_masivo_id).map((i: any) => i.grupo_masivo_id as string)).size

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
    ...(incCreadosRows  as any[]),
    ...(escRows         as any[]),
    ...(respRows        as any[]),
    ...(resolRows       as any[]),
    ...(canceladosRows  as any[]),
    ...(cerradosRows    as any[]),
    ...(contActRows     as any[]),
  ]
    .filter((a) => a.hora != null)
    .sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime())
    .slice(0, 30)

  const creadosHoy = Number((creadosHoyRows as any[])[0]?.total ?? 0)

  return NextResponse.json({
    activos: activosConEstado,
    resoluciones: resueltos,
    contingenciasActivas,
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
      creadosHoy,
      agentesEnGestion: equipoStats.filter((a: any) => a.casosActivos > 0).length,
      totalAgentes:     agentes.length,
      masivosActivos,
      gruposMasivosActivos,
    },
  })
}
