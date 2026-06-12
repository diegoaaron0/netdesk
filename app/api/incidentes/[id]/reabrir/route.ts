import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.reabrir')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const motivo: 'TIENDA_SIN_INTERNET' | 'ERROR_AGENTE' = body.motivo ?? 'ERROR_AGENTE'
  const justificacion: string = body.justificacion?.trim() ?? ''

  // Leer el incidente para acumular MTTR antes de reiniciar el reloj
  const [inc] = await db.select({
    mttrMinutos:           incidentes.mttrMinutos,
    tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
    horaRegistro:          incidentes.horaRegistro,
    horaFin:               incidentes.horaFin,
    horaRegistroOriginal:  incidentes.horaRegistroOriginal,
  }).from(incidentes).where(eq(incidentes.id, id))

  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Tiempo acumulado = lo que ya estaba acumulado + MTTR de esta última resolución incorrecta
  // El tiempo que estuvo "cerrado" entre resolución y reapertura NO se suma (no es responsabilidad del proveedor)
  const tiempoAcumuladoMin = (inc.tiempoAcumuladoMin ?? 0) + (inc.mttrMinutos ?? 0)

  // Preservar hora de inicio original (solo en la primera reapertura; en subsiguientes ya está guardada)
  const horaRegistroOriginal = inc.horaRegistroOriginal ?? inc.horaRegistro
  // Preservar el horaFin del cierre anterior para mostrarlo en el detalle
  const horaFinAnterior = inc.horaFin

  const horaLima = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const motivoLabel = motivo === 'TIENDA_SIN_INTERNET'
    ? 'Tienda nuevamente sin internet'
    : 'Error de gestión de agente'

  const reabiertaInfo = justificacion
    ? `Reabierto el ${horaLima} · ${motivoLabel} — ${justificacion}`
    : `Reabierto el ${horaLima} · ${motivoLabel}`

  const [updated] = await db.update(incidentes)
    .set({
      estado: 'ABIERTO',
      horaFin: null,
      mttrMinutos: null,
      horaRegistro: new Date(),        // reinicia el cronómetro desde ahora (base para MTTR parcial)
      tiempoAcumuladoMin,              // preserva el tiempo anterior (se sumará al resolver)
      motivoReabertura: motivo,
      justificacionReabertura: justificacion || null,
      reabiertaInfo,
      horaRegistroOriginal,            // hora de inicio real del incidente
      horaFinAnterior,                 // hora de cierre anterior (para mostrar en detalle)
      actualizadoEn: new Date(),
    })
    .where(eq(incidentes.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(updated)
}
