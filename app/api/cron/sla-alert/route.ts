import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'
import { sendMail } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const DOS_HORAS_MS = 2 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tag = '[cron/sla-alert]'
  console.log(`${tag} inicio`)

  try {
    const nowMs = Date.now()
    const dosHorasAtras = new Date(nowMs - DOS_HORAS_MS).toISOString()

    const [activosRows, alertasRows, supervisoresRows] = await Promise.all([
      // Incidentes activos con datos de escalamiento y contrato vigente
      db.execute(sql`
        SELECT
          i.id,
          i.codigo,
          i.tipo,
          i.hora_registro,
          t.codigo    AS tienda_codigo,
          t.nombre_cc AS tienda_nombre,
          u.nombre    AS agente_nombre,
          u.email     AS agente_email,
          esc.hora_correo_n1,
          esc.hora_primera_resp,
          COALESCE(cp.tiempo_respuesta_sla,  ${SLA_RESPUESTA_MIN})          AS sla_respuesta_min,
          COALESCE(cp.tiempo_resolucion_sla, ${SLA_RESOLUCION_DEFAULT_MIN}) AS sla_resolucion_min
        FROM incidentes i
        JOIN usuarios u ON i.registrado_por_id = u.id
        JOIN tiendas  t ON i.tienda_id = t.id
        LEFT JOIN LATERAL (
          SELECT
            MIN(hora_envio_correo) AS hora_correo_n1,
            MIN(hora_respuesta)    AS hora_primera_resp
          FROM escalamientos
          WHERE incidente_id = i.id
            AND hora_envio_correo IS NOT NULL
        ) esc ON true
        LEFT JOIN LATERAL (
          SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
          FROM contratos_proveedor cp2
          WHERE cp2.proveedor_id = COALESCE(i.proveedor_id, t.proveedor_id)
            AND (cp2.tienda_id = t.id OR cp2.tienda_id IS NULL)
            AND cp2.estado = 'VIGENTE'
          ORDER BY cp2.tienda_id NULLS LAST
          LIMIT 1
        ) cp ON true
        WHERE i.estado NOT IN ('RESUELTO', 'CANCELADO', 'CERRADO')
        ORDER BY i.hora_registro ASC
      `),
      db.execute(sql`
        SELECT incidente_id, tipo
        FROM sla_alertas
        WHERE enviado_en >= ${dosHorasAtras}::timestamptz
      `),
      db.execute(sql`
        SELECT email FROM usuarios
        WHERE rol IN ('SUPERVISOR', 'GERENCIA') AND activo = true
      `),
    ])

    const alertasSet = new Set(
      (alertasRows as any[]).map((a) => `${a.incidente_id}:${a.tipo}`)
    )
    const supEmails = (supervisoresRows as any[])
      .map((s) => s.email as string)
      .filter(Boolean)

    const enviadas: string[] = []
    const fallidas: string[] = []
    const insertQueue: Array<{ incidenteId: string; tipo: string }> = []

    console.log(`${tag} activos=${(activosRows as any[]).length} supervisores=${supEmails.length}`)

    for (const inc of activosRows as any[]) {
      const tiendaLabel  = `${inc.tienda_codigo}${inc.tienda_nombre ? ` (${inc.tienda_nombre})` : ''}`
      const slaRespMin   = Number(inc.sla_respuesta_min)
      const slaResolMin  = Number(inc.sla_resolucion_min)

      // ── SLA Respuesta: correo enviado pero proveedor aún no responde ─────────
      if (inc.hora_correo_n1 && !inc.hora_primera_resp) {
        const minutos = (nowMs - new Date(inc.hora_correo_n1).getTime()) / 60000
        const pct     = minutos / slaRespMin

        if (pct >= 1.0) {
          const key = `${inc.id}:RESPUESTA_VENCIDA`
          if (!alertasSet.has(key)) {
            const to = [inc.agente_email as string, ...supEmails].filter(Boolean)
            try {
              await sendMail({
                to,
                subject: `🚨 SLA Respuesta VENCIDO: ${inc.codigo} Tienda ${inc.tienda_codigo} — NetDesk`,
                text: [
                  `El proveedor NO ha respondido al incidente ${inc.codigo} (${inc.tipo}) en tienda ${tiendaLabel}.`,
                  `Tiempo sin respuesta: ${Math.round(minutos)} min | Límite: ${slaRespMin} min | Exceso: ${Math.round(minutos - slaRespMin)} min.`,
                  `Responsable: ${inc.agente_nombre}.`,
                  `Ingresa a NetDesk y considera escalar al siguiente nivel.`,
                ].join('\n'),
              })
              insertQueue.push({ incidenteId: inc.id as string, tipo: 'RESPUESTA_VENCIDA' })
              alertasSet.add(key)
              enviadas.push(`${inc.codigo}:RESPUESTA_VENCIDA`)
              console.log(`${tag} ✓ alerta RESPUESTA_VENCIDA → ${inc.codigo}`)
            } catch (mailErr) {
              console.error(`${tag} ✗ fallo mail RESPUESTA_VENCIDA ${inc.codigo}:`, mailErr)
              fallidas.push(`${inc.codigo}:RESPUESTA_VENCIDA`)
            }
          }
        } else if (pct >= 0.7) {
          const key = `${inc.id}:RESPUESTA_EN_RIESGO`
          if (!alertasSet.has(key)) {
            try {
              await sendMail({
                to: [inc.agente_email as string],
                subject: `⚠️ SLA Respuesta en riesgo: ${inc.codigo} Tienda ${inc.tienda_codigo} — NetDesk`,
                text: [
                  `El proveedor aún no responde al incidente ${inc.codigo} (${inc.tipo}) en tienda ${tiendaLabel}.`,
                  `Tiempo sin respuesta: ${Math.round(minutos)} min | Límite: ${slaRespMin} min | Consumido: ${Math.round(pct * 100)}%.`,
                  `Responsable: ${inc.agente_nombre}.`,
                  `Ingresa a NetDesk para hacer seguimiento.`,
                ].join('\n'),
              })
              insertQueue.push({ incidenteId: inc.id as string, tipo: 'RESPUESTA_EN_RIESGO' })
              alertasSet.add(key)
              enviadas.push(`${inc.codigo}:RESPUESTA_EN_RIESGO`)
              console.log(`${tag} ✓ alerta RESPUESTA_EN_RIESGO → ${inc.codigo}`)
            } catch (mailErr) {
              console.error(`${tag} ✗ fallo mail RESPUESTA_EN_RIESGO ${inc.codigo}:`, mailErr)
              fallidas.push(`${inc.codigo}:RESPUESTA_EN_RIESGO`)
            }
          }
        }
      }

      // ── SLA Resolución: proveedor respondió pero no resolvió ─────────────────
      if (inc.hora_primera_resp) {
        const minutos = (nowMs - new Date(inc.hora_primera_resp).getTime()) / 60000
        const pct     = minutos / slaResolMin

        if (pct >= 1.0) {
          const key = `${inc.id}:RESOLUCION_VENCIDA`
          if (!alertasSet.has(key)) {
            const to = [inc.agente_email as string, ...supEmails].filter(Boolean)
            try {
              await sendMail({
                to,
                subject: `🚨 SLA Resolución VENCIDO: ${inc.codigo} Tienda ${inc.tienda_codigo} — NetDesk`,
                text: [
                  `El proveedor NO ha resuelto el incidente ${inc.codigo} (${inc.tipo}) en tienda ${tiendaLabel}.`,
                  `Tiempo desde respuesta: ${Math.round(minutos)} min | Límite: ${slaResolMin} min | Exceso: ${Math.round(minutos - slaResolMin)} min.`,
                  `Responsable: ${inc.agente_nombre}.`,
                  `Ingresa a NetDesk para exigir resolución inmediata.`,
                ].join('\n'),
              })
              insertQueue.push({ incidenteId: inc.id as string, tipo: 'RESOLUCION_VENCIDA' })
              alertasSet.add(key)
              enviadas.push(`${inc.codigo}:RESOLUCION_VENCIDA`)
              console.log(`${tag} ✓ alerta RESOLUCION_VENCIDA → ${inc.codigo}`)
            } catch (mailErr) {
              console.error(`${tag} ✗ fallo mail RESOLUCION_VENCIDA ${inc.codigo}:`, mailErr)
              fallidas.push(`${inc.codigo}:RESOLUCION_VENCIDA`)
            }
          }
        } else if (pct >= 0.7) {
          const key = `${inc.id}:RESOLUCION_EN_RIESGO`
          if (!alertasSet.has(key)) {
            try {
              await sendMail({
                to: [inc.agente_email as string],
                subject: `⚠️ SLA Resolución en riesgo: ${inc.codigo} Tienda ${inc.tienda_codigo} — NetDesk`,
                text: [
                  `El proveedor no ha resuelto el incidente ${inc.codigo} (${inc.tipo}) en tienda ${tiendaLabel}.`,
                  `Tiempo desde respuesta: ${Math.round(minutos)} min | Límite: ${slaResolMin} min | Consumido: ${Math.round(pct * 100)}%.`,
                  `Responsable: ${inc.agente_nombre}.`,
                  `Ingresa a NetDesk para hacer seguimiento.`,
                ].join('\n'),
              })
              insertQueue.push({ incidenteId: inc.id as string, tipo: 'RESOLUCION_EN_RIESGO' })
              alertasSet.add(key)
              enviadas.push(`${inc.codigo}:RESOLUCION_EN_RIESGO`)
              console.log(`${tag} ✓ alerta RESOLUCION_EN_RIESGO → ${inc.codigo}`)
            } catch (mailErr) {
              console.error(`${tag} ✗ fallo mail RESOLUCION_EN_RIESGO ${inc.codigo}:`, mailErr)
              fallidas.push(`${inc.codigo}:RESOLUCION_EN_RIESGO`)
            }
          }
        }
      }
    }

    if (insertQueue.length > 0) {
      try {
        await db.execute(sql`
          INSERT INTO sla_alertas (incidente_id, tipo)
          SELECT * FROM unnest(
            ${insertQueue.map((r) => r.incidenteId)}::uuid[],
            ${insertQueue.map((r) => r.tipo)}::text[]
          )
        `)
      } catch (dbErr) {
        console.error(`${tag} ✗ fallo al registrar alertas en DB:`, dbErr)
      }
    }

    const result = {
      ok: fallidas.length === 0,
      evaluados: (activosRows as any[]).length,
      enviadas,
      ...(fallidas.length > 0 && { fallidas }),
    }
    console.log(`${tag} fin`, result)
    return NextResponse.json(result)

  } catch (err) {
    console.error(`${tag} error fatal:`, err)
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    )
  }
}
