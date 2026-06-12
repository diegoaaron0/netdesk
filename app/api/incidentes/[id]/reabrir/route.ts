import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas } from '@/drizzle/schema'
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

  // Leer el incidente para acumular MTTR e IEI antes de reiniciar el reloj
  const [inc] = await db.select({
    mttrMinutos:           incidentes.mttrMinutos,
    tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
    ieiAcumulado:          incidentes.ieiAcumulado,
    horaRegistro:          incidentes.horaRegistro,
    horaFin:               incidentes.horaFin,
    horaRegistroOriginal:  incidentes.horaRegistroOriginal,
    tiendaId:              incidentes.tiendaId,
    tipo:                  incidentes.tipo,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraActivacion:    incidentes.contHoraActivacion,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    contRendimiento:       incidentes.contRendimiento,
    contEsExterno:         incidentes.contEsExterno,
    movHoraActivacion:     incidentes.movHoraActivacion,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    movRendimiento:        incidentes.movRendimiento,
    boletaManual:          incidentes.boletaManual,
    boletaRendimiento:     incidentes.boletaRendimiento,
    boletaHoraActivacion:  incidentes.boletaHoraActivacion,
  }).from(incidentes).where(eq(incidentes.id, id))

  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Tiempo acumulado = lo que ya estaba acumulado + MTTR de esta última resolución incorrecta
  // El tiempo que estuvo "cerrado" entre resolución y reapertura NO se suma (no es responsabilidad del proveedor)
  const tiempoAcumuladoMin = (inc.tiempoAcumuladoMin ?? 0) + (inc.mttrMinutos ?? 0)

  // IEI acumulado: calcular IEI del período que se está cerrando (horaRegistro → horaFin) y sumar al acumulado.
  // Cada período se calcula de forma independiente sobre sus propios timestamps de contingencia,
  // que se clipean automáticamente al rango del período por calcImpactoRow.
  let ieiAcumulado = Number(inc.ieiAcumulado ?? 0)
  try {
    const [tienda] = await db.select({
      ventaHoraSoles:    tiendas.ventaHoraSoles,
      ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
      cluster:           tiendas.cluster,
    }).from(tiendas).where(eq(tiendas.id, inc.tiendaId!))

    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const ieiPeriodo = calcImpactoRow({
      hora_registro:           inc.horaRegistro,
      hora_fin:                inc.horaFin,
      estado:                  'RESUELTO',
      tipo:                    inc.tipo,
      venta_hora_soles:        tienda?.ventaHoraSoles,
      venta_hora_fds_soles:    tienda?.ventaHoraFdsSoles,
      cluster:                 tienda?.cluster,
      cont_hora_activacion:    inc.contActivadoPor ? inc.contHoraActivacion : null,
      cont_hora_desactivacion: inc.contHoraDesactivacion,
      cont_rendimiento:        inc.contRendimiento,
      cont_es_externo:         inc.contEsExterno,
      mov_hora_activacion:     inc.movHoraActivacion,
      mov_hora_desactivacion:  inc.movHoraDesactivacion,
      mov_rendimiento:         inc.movRendimiento,
      boleta_manual:           inc.boletaManual,
      boleta_rendimiento:      inc.boletaRendimiento,
      boleta_hora_activacion:  inc.boletaHoraActivacion,
    })
    ieiAcumulado += ieiPeriodo.impactoEconomicoEstimado ?? 0
  } catch { /* si falla el cálculo, se acumula 0 para este período */ }

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
      tiempoAcumuladoMin,              // preserva el tiempo activo anterior (se sumará al resolver)
      ieiAcumulado: String(ieiAcumulado), // IEI acumulado de todos los períodos cerrados anteriores
      motivoReabertura: motivo,
      justificacionReabertura: justificacion || null,
      reabiertaInfo,
      horaRegistroOriginal,            // hora de inicio real del incidente (nunca se pisa)
      horaFinAnterior,                 // hora de cierre anterior (para mostrar en detalle)
      actualizadoEn: new Date(),
    })
    .where(eq(incidentes.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(updated)
}
