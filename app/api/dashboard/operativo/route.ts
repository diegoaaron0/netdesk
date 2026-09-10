import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'
import { calcIeTramo, type TipoMitigacionTramo } from '@/lib/mitigacion-tramos'
import { calcImpactoEnCurso } from '@/lib/impacto-calc'

export function getEstadoOp(tipo: string, horaRegistro: Date | string, pendienteProveedor: boolean, estadoDB: string, nowMs: number, slaResolucionOverrideMin?: number | null) {
  const minutos = (nowMs - new Date(horaRegistro).getTime()) / 60000
  const slaLimite = slaResolucionOverrideMin ?? SLA_RESOLUCION_DEFAULT_MIN
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

  const [activosRows, resueltoRows, agentesRows, incCreadosRows, escRows, respRows, resolRows, canceladosRows, cerradosRows, contRows, creadosHoyRows, contStandaloneRows, movRows, boletaRows, contActRows, tramosActivosRows, evalPendRows, contratosRows, fichasFechaFinRows, tiendasSinVentaRows] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.estado,
        i.tipo,
        i.nivel_impacto,
        (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
        i.registrado_por_id           AS agente_id,
        u.nombre                      AS agente_nombre,
        t.id                          AS tienda_id,
        t.codigo                      AS tienda_codigo,
        t.nombre_cc                   AS tienda_nombre,
        t.distrito                    AS tienda_distrito,
        t.cluster                     AS tienda_cluster,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
        (SELECT tiempo_respuesta_sla  FROM fichas WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id) LIMIT 1) AS sla_respuesta_override,
        (SELECT tiempo_resolucion_sla FROM fichas WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id) LIMIT 1) AS sla_resolucion_override,
        EXISTS (
          SELECT 1 FROM escalamientos e2
          WHERE e2.incidente_id = i.id
            AND e2.hora_envio_correo IS NOT NULL
            AND e2.hora_respuesta    IS NULL
        ) AS pendiente_proveedor,
        i.motivo_reabertura,
        i.cont_activado_por,
        (i.cont_hora_activacion    AT TIME ZONE 'UTC') AS cont_hora_activacion,
        (i.cont_hora_desactivacion AT TIME ZONE 'UTC') AS cont_hora_desactivacion,
        i.cont_rendimiento,
        i.cont_es_externo,
        i.mov_activado_por,
        (i.mov_hora_activacion    AT TIME ZONE 'UTC') AS mov_hora_activacion,
        (i.mov_hora_desactivacion AT TIME ZONE 'UTC') AS mov_hora_desactivacion,
        i.mov_rendimiento,
        i.boleta_manual,
        i.boleta_rendimiento,
        (i.boleta_hora_activacion AT TIME ZONE 'UTC') AS boleta_hora_activacion,
        i.escalado_infra_id,
        (i.hora_escalado_infra AT TIME ZONE 'UTC') AS hora_escalado_infra,
        infra_u.nombre AS infra_nombre,
        (mov.ultimo_movimiento AT TIME ZONE 'UTC') AS ultimo_movimiento,
        -- Alertas: descartes de diagnóstico. Nullable a proposito — null es
        -- "nunca se respondio", distinto de false ("se verifico y fallo").
        i.desc_energia, i.desc_router, i.desc_cableado, i.desc_reinicio_equipo,
        -- Alertas: la tienda tiene con que hacer contingencia?
        t.tiene_contingencia AS tienda_tiene_contingencia,
        EXISTS (
          SELECT 1 FROM routers_externos re2
          WHERE re2.tienda_actual_id = t.id AND re2.activo
        ) AS tienda_tiene_router_externo,
        -- Alertas: desde cuando se espera respuesta del proveedor. Se mide
        -- desde el envio del correo de escalamiento, no desde hora_registro.
        (esc_pend.desde AT TIME ZONE 'UTC') AS esperando_proveedor_desde,
        i.grupo_masivo_id,
        gm.codigo  AS grupo_masivo_codigo,
        gm.razon   AS grupo_masivo_razon,
        i.router_externo_id,
        re.codigo  AS router_externo_codigo,
        -- venta/hora según día de semana del incidente (0=dom,5=vie,6=sab = FDS)
        CASE
          WHEN EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') IN (0,5,6)
          THEN COALESCE(t.venta_hora_fds_soles, t.venta_hora_soles)
          ELSE COALESCE(t.venta_hora_soles, t.venta_hora_fds_soles)
        END AS iei_venta_hora,
        -- venta/hora cruda de la tienda (L-J y V-D) — necesaria para calcIeTramo,
        -- que resuelve la tarifa según el día de INICIO DE CADA TRAMO, no del
        -- día de registro del incidente (puede ser un día distinto).
        t.venta_hora_soles     AS tienda_venta_hora_soles,
        t.venta_hora_fds_soles AS tienda_venta_hora_fds_soles
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
      LEFT JOIN LATERAL (
        SELECT MIN(e.hora_envio_correo) AS desde
        FROM escalamientos e
        WHERE e.incidente_id = i.id
          AND e.hora_envio_correo IS NOT NULL
          AND e.hora_respuesta    IS NULL
      ) esc_pend ON true
      LEFT JOIN grupos_masivos gm ON i.grupo_masivo_id = gm.id
      LEFT JOIN routers_externos re ON i.router_externo_id = re.id
      WHERE ${isToday
        ? sql`i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
        : sql`i.hora_registro >= ${diaIso}::timestamptz AND i.hora_registro < ${siguienteIso}::timestamptz AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
      }
      ORDER BY i.hora_registro ASC
    `),

    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.nivel_impacto,
        (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
        (i.hora_fin       AT TIME ZONE 'UTC') AS hora_fin,
        i.mttr_minutos,
        i.resuelto_por,
        i.resuelto_por = 'PROVEEDOR' AS por_proveedor,
        i.registrado_por_id AS agente_id,
        i.resuelto_por_usuario_id AS resolutor_id,
        u.nombre AS agente_nombre,
        t.codigo AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        t.distrito AS tienda_distrito,
        t.cluster  AS tienda_cluster,
        COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
        (SELECT tiempo_respuesta_sla  FROM fichas WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id) LIMIT 1) AS sla_respuesta_override,
        (SELECT tiempo_resolucion_sla FROM fichas WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id) LIMIT 1) AS sla_resolucion_override,
        i.cont_activado_por,
        i.cont_es_externo,
        i.cont_rendimiento,
        i.mov_activado_por,
        i.mov_rendimiento,
        i.boleta_manual,
        i.boleta_rendimiento,
        -- venta/hora según día de semana del incidente (0=dom,5=vie,6=sab = FDS) — mismo criterio que la query de activos
        CASE
          WHEN EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') IN (0,5,6)
          THEN COALESCE(t.venta_hora_fds_soles, t.venta_hora_soles)
          ELSE COALESCE(t.venta_hora_soles, t.venta_hora_fds_soles)
        END AS iei_venta_hora
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
      WHERE activo = true AND rol IN ('AGENTE','SUPERVISOR','INFRAESTRUCTURA')
      ORDER BY nombre
    `),

    db.execute(sql`
      SELECT 'CREADO' AS tipo_evento, i.id, i.codigo,
             (i.hora_registro AT TIME ZONE 'UTC') AS hora, u.nombre AS actor, NULL::text AS proveedor_nombre, NULL::int AS nivel
      FROM incidentes i JOIN usuarios u ON i.registrado_por_id = u.id
      WHERE i.hora_registro >= NOW() - INTERVAL '24 hours'
      ORDER BY i.hora_registro DESC LIMIT 15
    `),

    db.execute(sql`
      SELECT 'ESCALADO' AS tipo_evento, i.id, i.codigo,
             (e.hora_envio_correo AT TIME ZONE 'UTC') AS hora,
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
             (e.hora_respuesta AT TIME ZONE 'UTC') AS hora, u.nombre AS actor,
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
             (i.hora_fin AT TIME ZONE 'UTC') AS hora,
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
             (i.hora_fin AT TIME ZONE 'UTC') AS hora,
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
             (i.hora_fin AT TIME ZONE 'UTC') AS hora,
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
        (i.cont_hora_activacion AT TIME ZONE 'UTC') AS cont_hora_activacion,
        i.cont_rendimiento,
        i.cont_observacion,
        i.cont_es_externo,
        i.router_externo_id,
        re.codigo          AS router_externo_codigo
      FROM tiendas t
      INNER JOIN incidentes i ON i.tienda_id = t.id
        AND i.cont_activado_por IS NOT NULL
        AND i.cont_hora_desactivacion IS NULL
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      LEFT JOIN routers_externos re ON i.router_externo_id = re.id
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
        (i.mov_hora_activacion AT TIME ZONE 'UTC') AS cont_hora_activacion,
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
        (i.boleta_hora_activacion AT TIME ZONE 'UTC') AS cont_hora_activacion,
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

    // ── Activaciones y desactivaciones de contingencia (últimas 24h) ───────────
    db.execute(sql`
      SELECT tipo_evento, id, codigo, hora, actor, proveedor_nombre, NULL::int AS nivel, tipo_contingencia FROM (
        -- Activaciones de contingencia router (incidentes)
        SELECT 'CONTINGENCIA'::text AS tipo_evento, i.id::text AS id, t.codigo,
               i.cont_hora_activacion AS hora, i.cont_activado_por AS actor,
               COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
               CASE WHEN i.cont_es_externo THEN 'ROUTER_EXTERNO' ELSE 'ROUTER_PROPIO' END AS tipo_contingencia
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.cont_hora_activacion IS NOT NULL
          AND i.cont_hora_activacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        -- Desactivaciones de contingencia router (incidentes)
        SELECT 'CONTINGENCIA_FIN'::text, i.id::text, t.codigo,
               i.cont_hora_desactivacion, i.cont_activado_por,
               COALESCE(pi.nombre, pt.nombre),
               CASE WHEN i.cont_es_externo THEN 'ROUTER_EXTERNO' ELSE 'ROUTER_PROPIO' END
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.cont_hora_desactivacion IS NOT NULL
          AND i.cont_hora_desactivacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        -- Activaciones datos móviles
        SELECT 'CONTINGENCIA'::text, i.id::text, t.codigo,
               i.mov_hora_activacion, i.mov_activado_por,
               COALESCE(pi.nombre, pt.nombre), 'DATOS_MOVILES'::text
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.mov_hora_activacion IS NOT NULL
          AND i.mov_hora_activacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        -- Desactivaciones datos móviles
        SELECT 'CONTINGENCIA_FIN'::text, i.id::text, t.codigo,
               i.mov_hora_desactivacion, i.mov_activado_por,
               COALESCE(pi.nombre, pt.nombre), 'DATOS_MOVILES'::text
        FROM incidentes i
        JOIN tiendas t ON i.tienda_id = t.id
        LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE i.mov_hora_desactivacion IS NOT NULL
          AND i.mov_hora_desactivacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        -- Activaciones standalone
        SELECT 'CONTINGENCIA'::text, c.id::text, t.codigo,
               c.hora_activacion, c.activado_por,
               pt.nombre, c.tipo
        FROM contingencias c
        JOIN tiendas t ON c.tienda_id = t.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE c.hora_activacion >= NOW() - INTERVAL '24 hours'
        UNION ALL
        -- Desactivaciones standalone
        SELECT 'CONTINGENCIA_FIN'::text, c.id::text, t.codigo,
               c.hora_desactivacion, c.activado_por,
               pt.nombre, c.tipo
        FROM contingencias c
        JOIN tiendas t ON c.tienda_id = t.id
        LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
        WHERE c.hora_desactivacion IS NOT NULL
          AND c.hora_desactivacion >= NOW() - INTERVAL '24 hours'
      ) sub
      ORDER BY hora DESC LIMIT 30
    `),

    // ── Tramos de mitigación de los incidentes activos (Fase 4) ─────────────
    // Mismo filtro que la query de "activos" de arriba, para no depender de
    // los ids ya resueltos (permite que esta query corra en paralelo con esa).
    db.execute(sql`
      SELECT
        tr.incidente_id, tr.tipo, tr.factor,
        (tr.desde AT TIME ZONE 'UTC') AS desde,
        (tr.hasta AT TIME ZONE 'UTC') AS hasta,
        tr.ie_tramo
      FROM incidente_mitigacion_tramos tr
      JOIN incidentes i ON tr.incidente_id = i.id
      WHERE ${isToday
        ? sql`i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
        : sql`i.hora_registro >= ${diaIso}::timestamptz AND i.hora_registro < ${siguienteIso}::timestamptz AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
      }
    `),

    // ── Alertas: evaluaciones de gestion de cambios vencidas (30/90 dias) ────
    // Solo acciones ya ejecutadas y todavia en ventana de evaluacion: una
    // COMPLETADO o BORRADOR con fecha cumplida no es una tarea pendiente.
    db.execute(sql`
      SELECT id, codigo, titulo, 30 AS ventana, fecha_eval_30 AS fecha
      FROM acciones_gestion
      WHERE estado IN ('EJECUTADO','EN_EVALUACION')
        AND fecha_eval_30 IS NOT NULL AND fecha_eval_30 <= CURRENT_DATE
        AND NOT COALESCE(eval30_completada, false)
      UNION ALL
      SELECT id, codigo, titulo, 90 AS ventana, fecha_eval_90 AS fecha
      FROM acciones_gestion
      WHERE estado IN ('EJECUTADO','EN_EVALUACION')
        AND fecha_eval_90 IS NOT NULL AND fecha_eval_90 <= CURRENT_DATE
        AND NOT COALESCE(eval90_completada, false)
      ORDER BY fecha ASC
    `),

    // ── Alertas: contratos por vencer (ficha activa de una tienda activa) ────
    db.execute(sql`
      SELECT
        f.id AS ficha_id, f.codigo AS ficha_codigo,
        t.id AS tienda_id, t.codigo AS tienda_codigo, t.nombre_cc AS tienda_nombre,
        f.fecha_fin,
        (f.fecha_fin - CURRENT_DATE)::int AS dias_restantes,
        COALESCE(f.renovacion_automatica, false) AS renovacion_automatica
      FROM fichas f
      JOIN tiendas t ON t.ficha_activa_id = f.id
      WHERE f.estado = 'ACTIVA' AND t.estado = 'ACTIVA'
        AND f.fecha_fin IS NOT NULL
        AND f.fecha_fin >= CURRENT_DATE
        AND f.fecha_fin <= CURRENT_DATE + 60
      ORDER BY f.fecha_fin ASC
    `),

    // Cobertura de fecha_fin. Al 10/09/2026 produccion tiene 159 fichas activas
    // y 0 con fecha_fin: sin esto la alerta de contratos se veria "en cero"
    // como si todo estuviera al dia, cuando en realidad no hay dato cargado.
    db.execute(sql`
      SELECT COUNT(*)::int AS activas, COUNT(fecha_fin)::int AS con_fecha_fin
      FROM fichas WHERE estado = 'ACTIVA'
    `),

    // ── Alertas: tiendas sin venta configurada (agrupadas en una linea) ──────
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM tiendas
      WHERE estado = 'ACTIVA'
        AND venta_mensual_soles IS NULL
        AND creado_en <= NOW() - INTERVAL '7 days'
    `),
  ])

  const activos  = activosRows as any[]
  const resueltos = resueltoRows as any[]
  const agentes   = agentesRows as any[]

  const contInc = (contRows as any[]).map((c: any) => ({
    ...c,
    fuente: 'INCIDENTE',
    tipo_contingencia:   c.cont_es_externo ? 'ROUTER_EXTERNO' : 'ROUTER_PROPIO',
    router_externo_codigo: c.router_externo_codigo ?? null,
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

  // IEI por incidente — Fase 4: mismo criterio que "Desglose por tramos" del
  // detalle de incidente. Si el incidente ya tiene tramos: SUM(ie_tramo de los
  // cerrados) + IEI en vivo del tramo abierto (calcIeTramo, misma función que
  // usa el endpoint de mitigación al sellar un tramo). Si todavía no tiene
  // ningún tramo (no tocado por el flujo nuevo): fallback al cálculo viejo
  // (calcImpactoEnCurso) para no dejarlo en S/0.
  const tramosPorIncidente = new Map<string, any[]>()
  for (const t of tramosActivosRows as any[]) {
    if (!tramosPorIncidente.has(t.incidente_id)) tramosPorIncidente.set(t.incidente_id, [])
    tramosPorIncidente.get(t.incidente_id)!.push(t)
  }
  const ahora = new Date(nowMs)

  const activosConEstado = activos.map((inc: any) => {
    const d = getEstadoOp(inc.tipo, inc.hora_registro, inc.pendiente_proveedor, inc.estado, nowMs, inc.sla_resolucion_override)
    const refMs = inc.ultimo_movimiento
      ? new Date(inc.ultimo_movimiento).getTime()
      : new Date(inc.hora_registro).getTime()
    const sinMovimientoMin = Math.round((nowMs - refMs) / 60000)

    const tramos = tramosPorIncidente.get(inc.id) ?? []
    const tiendaVenta = { ventaHoraSoles: inc.tienda_venta_hora_soles, ventaHoraFdsSoles: inc.tienda_venta_hora_fds_soles }
    const ieiCalculado = tramos.length > 0
      ? tramos.reduce((sum: number, t: any) => {
          if (t.hasta != null) return sum + Number(t.ie_tramo ?? 0)
          return sum + calcIeTramo(
            { tipo: t.tipo as TipoMitigacionTramo, factor: t.factor, desde: t.desde, hasta: null, tipoIncidente: inc.tipo },
            tiendaVenta, ahora,
          )
        }, 0)
      : calcImpactoEnCurso(inc, nowMs)

    // Desde cuándo el incidente está sin mitigación activa (alerta 1). La
    // fuente buena es el tramo abierto SIN_MITIGACION, que da el instante
    // exacto. Los incidentes viejos que nunca pasaron por el flujo de tramos
    // no tienen ninguno: ahí se cae a los flags cont/mov/boleta y, si ninguno
    // está activo, el incidente estuvo sin mitigar desde que se registró.
    const tramoAbierto = tramos.find((t: any) => t.hasta == null)
    let sinMitigacionDesde: string | null = null
    if (tramos.length > 0) {
      if (tramoAbierto && tramoAbierto.tipo === 'SIN_MITIGACION') sinMitigacionDesde = tramoAbierto.desde
    } else {
      const algunaActiva = !!(
        (inc.cont_activado_por && !inc.cont_hora_desactivacion) ||
        (inc.mov_activado_por  && !inc.mov_hora_desactivacion)  ||
        (inc.boleta_manual && inc.boleta_hora_activacion)
      )
      if (!algunaActiva) sinMitigacionDesde = inc.hora_registro
    }

    return { ...inc, ...d, sinMovimientoMin, sinMovimiento: sinMovimientoMin > 120, iei_calculado: ieiCalculado, sinMitigacionDesde }
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
    // "Resuelto hoy" se atribuye a quien lo resolvió (resolutor_id). Para incidentes
    // resueltos antes de registrar el resolutor, se cae al creador para no perder
    // la atribución histórica.
    const misRes      = resueltos.filter((r: any) => (r.resolutor_id ?? r.agente_id) === ag.id)
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
    // Insumos de la sección Alertas que no salen de la cola de activos.
    alertasData: {
      evaluacionesPendientes: evalPendRows as any[],
      contratosPorVencer:     contratosRows as any[],
      contratosCobertura: {
        fichasActivas: Number((fichasFechaFinRows as any[])[0]?.activas ?? 0),
        conFechaFin:   Number((fichasFechaFinRows as any[])[0]?.con_fecha_fin ?? 0),
      },
      tiendasSinVenta: Number((tiendasSinVentaRows as any[])[0]?.total ?? 0),
    },
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
