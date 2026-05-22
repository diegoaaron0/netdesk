import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { SLA_RESOLUCION_POR_TIPO } from '@/lib/sla-core'
import { sendMail } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const DOS_HORAS_MS = 2 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const nowMs = Date.now()
  const dosHorasAtras = new Date(nowMs - DOS_HORAS_MS).toISOString()

  const [activosRows, alertasRows, supervisoresRows] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.hora_registro,
        u.nombre  AS agente_nombre,
        u.email   AS agente_email
      FROM incidentes i
      JOIN usuarios u ON i.registrado_por_id = u.id
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
  const insertQueue: Array<{ incidenteId: string; tipo: string }> = []

  for (const inc of activosRows as any[]) {
    const minutos = (nowMs - new Date(inc.hora_registro).getTime()) / 60000
    const slaLimite = SLA_RESOLUCION_POR_TIPO[inc.tipo as string] ?? 120
    const pctSla = minutos / slaLimite

    if (pctSla >= 1.0) {
      const key = `${inc.id}:VENCIDO`
      if (alertasSet.has(key)) continue
      const to = [inc.agente_email as string, ...supEmails].filter(Boolean)
      await sendMail({
        to,
        subject: `🚨 SLA VENCIDO: ${inc.codigo} — NetDesk Footloose`,
        text: [
          `El incidente ${inc.codigo} (${inc.tipo}) tiene el SLA VENCIDO.`,
          `Tiempo abierto: ${Math.round(minutos)} min | Límite: ${slaLimite} min | Exceso: ${Math.round(minutos - slaLimite)} min.`,
          `Responsable: ${inc.agente_nombre}.`,
          `Ingresa a NetDesk para gestionar este incidente de inmediato.`,
        ].join('\n'),
      })
      insertQueue.push({ incidenteId: inc.id as string, tipo: 'VENCIDO' })
      alertasSet.add(key)
      enviadas.push(`${inc.codigo}:VENCIDO`)
    } else if (pctSla >= 0.7) {
      const key = `${inc.id}:EN_RIESGO`
      if (alertasSet.has(key)) continue
      await sendMail({
        to: [inc.agente_email as string],
        subject: `⚠️ SLA en riesgo: ${inc.codigo} — NetDesk Footloose`,
        text: [
          `El incidente ${inc.codigo} (${inc.tipo}) está en riesgo de vencer SLA.`,
          `Tiempo abierto: ${Math.round(minutos)} min | Límite: ${slaLimite} min | Consumido: ${Math.round(pctSla * 100)}%.`,
          `Responsable: ${inc.agente_nombre}.`,
          `Ingresa a NetDesk para gestionar este incidente.`,
        ].join('\n'),
      })
      insertQueue.push({ incidenteId: inc.id as string, tipo: 'EN_RIESGO' })
      alertasSet.add(key)
      enviadas.push(`${inc.codigo}:EN_RIESGO`)
    }
  }

  if (insertQueue.length > 0) {
    await db.execute(sql`
      INSERT INTO sla_alertas (incidente_id, tipo)
      SELECT * FROM unnest(
        ${insertQueue.map((r) => r.incidenteId)}::uuid[],
        ${insertQueue.map((r) => r.tipo)}::text[]
      )
    `)
  }

  return NextResponse.json({ ok: true, evaluados: (activosRows as any[]).length, enviadas })
}
