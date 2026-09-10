/**
 * migracion-tramos-historicos.ts — Fase 3: reconstrucción de tramos para
 * incidentes viejos a partir de sus campos actuales (cont_, mov_, boleta_
 * y mitigaciones_previas). Función pura — no toca la base de datos; el script
 * (scripts/migrate-tramos-historicos.ts) hace la I/O y llama a esto.
 *
 * Principio general: replica EXACTAMENTE la segmentación de calcImpactoRow
 * (mismos breakpoints, misma regla "gana el menor factor"), pero en vez de
 * acumular un solo IEI devuelve un tramo por segmento — para que
 * SUM(ie_tramo) coincida con calcImpactoRow dentro de una tolerancia chica
 * de redondeo (cada segmento se redondea individualmente, calcImpactoRow
 * redondea solo el total — ver PASO de verificación en el script).
 *
 * Ver diseño acordado (Fase 3, instrucciones de Diego) para las reglas de
 * negocio exactas. Resumen de decisiones no explícitas tomadas acá:
 *   - "Ciclos": un incidente nunca reabierto tiene 1 ciclo [horaRegistro,
 *     horaFin]. Uno reabierto EXACTAMENTE una vez tiene 2 ciclos, usando
 *     horaRegistroOriginal/horaFinAnterior como límites del ciclo 1 y
 *     horaRegistro/horaFin como límites del ciclo 2 (el actual). Un
 *     incidente reabierto MÁS de una vez no es reconstruible con los campos
 *     actuales (no hay dónde se guarde el inicio de los ciclos intermedios
 *     ni su fin, salvo que coincida con el cerradoEn de mitigaciones_previas
 *     — y aun así, el INICIO de esos ciclos intermedios se pierde) → excepción.
 *   - boleta_manual NO se archiva en mitigaciones_previas y persiste sin
 *     resetearse a través de una reapertura — si el incidente fue reabierto
 *     Y boleta_manual sigue activo, no hay forma de saber a qué ciclo(s)
 *     pertenece sin adivinar → excepción. Boleta sí se soporta normalmente
 *     en incidentes nunca reabiertos.
 *   - El hueco entre el cierre de un ciclo y el inicio del siguiente
 *     (la pausa real entre resolver y reabrir) se deja sin cubrir a
 *     propósito — mismo criterio que el modelo nuevo (Paso 4).
 */

import { resolveVentaHora, isActiveAt, normContFactor, normBoletaFactor } from './impacto-calc'
import { factorBaseSinMitigacion, type TipoMitigacionTramo } from './mitigacion-tramos'
import { DASHBOARD_CONFIG } from './dashboard-config'

// ─── Input ──────────────────────────────────────────────────────────────────

export interface MitigacionPreviaInput {
  clase: 'ROUTER_PROPIO' | 'ROUTER_EXTERNO' | 'DATOS_MOVILES'
  activadoPor?: string | null
  horaActivacion: Date | string
  horaDesactivacion?: Date | string | null
  rendimiento?: string | null
  observacion?: string | null
  routerExternoId?: string | null
  cerradoEn: Date | string
}

export interface IncidenteMigracionInput {
  id: string
  tipo: string
  estado: string
  horaRegistro: Date | string
  horaFin: Date | string | null
  horaRegistroOriginal: Date | string | null
  horaFinAnterior: Date | string | null
  mitigacionesPrevias: MitigacionPreviaInput[] | null

  contActivadoPor: string | null
  contHoraActivacion: Date | string | null
  contHoraDesactivacion: Date | string | null
  contRendimiento: string | null
  contObservacion: string | null
  contEsExterno: boolean | null
  routerExternoId: string | null

  movActivadoPor: string | null
  movHoraActivacion: Date | string | null
  movHoraDesactivacion: Date | string | null
  movRendimiento: string | null
  movObservacion: string | null

  boletaManual: boolean | null
  boletaRendimiento: string | null
  boletaHoraActivacion: Date | string | null
}

export interface TiendaVentaInput {
  venta_hora_soles?: number | string | null
  venta_hora_fds_soles?: number | string | null
  cluster?: string | null
}

// ─── Output ─────────────────────────────────────────────────────────────────

export interface TramoConstruido {
  tipo: TipoMitigacionTramo
  factor: number
  desde: Date
  hasta: Date | null
  ieTramo: number | null
  activadoPor: string | null
  observacion: string | null
  routerExternoId: string | null
}

export type ResultadoConstruccion =
  | { ok: true; tramos: TramoConstruido[] }
  | { ok: false; codigo: string; motivo: string }

// ─── Helpers internos ───────────────────────────────────────────────────────

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

interface Candidato {
  tipo: TipoMitigacionTramo
  factor: number
  desde: Date
  hasta: Date | null
  activadoPor: string | null
  observacion: string | null
  routerExternoId: string | null
}

/** Regla confirmada: activación con timestamp anterior al inicio del ciclo
 *  → se recorta a ese inicio, y se guarda el original en observacion. */
function clipCandidatoAlCiclo(c: Candidato, cicloDesde: Date, cicloHasta: Date | null): Candidato {
  let { desde, hasta, observacion } = c
  if (desde.getTime() < cicloDesde.getTime()) {
    const nota = `[migración: activación original ${desde.toISOString()} anterior al inicio del ciclo, recortada a ${cicloDesde.toISOString()}]`
    observacion = observacion ? `${observacion} ${nota}` : nota
    desde = cicloDesde
  }
  if (cicloHasta && (hasta === null || hasta.getTime() > cicloHasta.getTime())) {
    hasta = cicloHasta
  }
  return { ...c, desde, hasta, observacion }
}

interface Opcion { tipo: TipoMitigacionTramo; factor: number; candidato: Candidato | null }

function opcionesEn(pointMs: number, candidatos: Candidato[], tipoIncidente: string, factorBase: number): Opcion[] {
  const activos = candidatos.filter(c => isActiveAt(c.desde, c.hasta, pointMs))
  if (tipoIncidente === 'CORTE_ELECTRICO') {
    const boleta = activos.find(c => c.tipo === 'BOLETA_MANUAL')
    return boleta
      ? [{ tipo: 'BOLETA_MANUAL', factor: boleta.factor, candidato: boleta }]
      : [{ tipo: 'SIN_MITIGACION', factor: factorBase, candidato: null }]
  }
  if (activos.length === 0) return [{ tipo: 'SIN_MITIGACION', factor: factorBase, candidato: null }]
  return activos.map(c => ({ tipo: c.tipo, factor: c.factor, candidato: c }))
}

/** Segmenta UN ciclo en tramos, replicando la segmentación de calcImpactoRow.
 *  cicloHasta=null → el ciclo sigue abierto: el último segmento queda con
 *  hasta=null (ie_tramo=null), igual que el invariante del modelo nuevo. */
function segmentarCiclo(args: {
  cicloDesde: Date
  cicloHasta: Date | null
  candidatos: Candidato[]
  tipoIncidente: string
  ventaHoraCiclo: number
  ahora: Date
}): TramoConstruido[] {
  const { cicloDesde, cicloHasta, candidatos, tipoIncidente, ventaHoraCiclo, ahora } = args
  const limiteBp = cicloHasta ?? ahora
  const factorBase = factorBaseSinMitigacion(tipoIncidente)

  const bp = new Set<number>([cicloDesde.getTime()])
  if (cicloHasta) bp.add(cicloHasta.getTime())
  for (const c of candidatos) {
    const dMs = c.desde.getTime()
    const hMs = c.hasta ? c.hasta.getTime() : limiteBp.getTime()
    if (dMs > cicloDesde.getTime() && dMs < limiteBp.getTime()) bp.add(dMs)
    if (hMs > cicloDesde.getTime() && hMs < limiteBp.getTime()) bp.add(hMs)
  }
  const breakpoints = Array.from(bp).sort((a, b) => a - b)

  const tramoDesdeOpcion = (opcion: Opcion, desde: Date, hasta: Date | null, ieTramo: number | null): TramoConstruido => ({
    tipo: opcion.tipo,
    factor: opcion.factor,
    desde, hasta, ieTramo,
    activadoPor: opcion.candidato?.activadoPor ?? null,
    observacion: opcion.candidato?.observacion ?? null,
    routerExternoId: opcion.candidato?.routerExternoId ?? null,
  })

  const tramos: TramoConstruido[] = []
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segDesdeMs = breakpoints[i]
    const segHastaMs = breakpoints[i + 1]
    const midMs = (segDesdeMs + segHastaMs) / 2
    const horas = (segHastaMs - segDesdeMs) / 3600000
    const opciones = opcionesEn(midMs, candidatos, tipoIncidente, factorBase)
    const ganador = opciones.reduce((a, b) => (a.factor <= b.factor ? a : b))
    const ieTramo = Math.round(ventaHoraCiclo * horas * DASHBOARD_CONFIG.MARGEN_BRUTO * ganador.factor)
    tramos.push(tramoDesdeOpcion(ganador, new Date(segDesdeMs), new Date(segHastaMs), ieTramo))
  }

  if (cicloHasta === null) {
    const ultimoBp = breakpoints[breakpoints.length - 1]
    const opciones = opcionesEn(ahora.getTime(), candidatos, tipoIncidente, factorBase)
    const ganador = opciones.reduce((a, b) => (a.factor <= b.factor ? a : b))
    tramos.push(tramoDesdeOpcion(ganador, new Date(ultimoBp), null, null))
  }

  return tramos
}

// ─── Detección de ciclos ────────────────────────────────────────────────────

interface Ciclo { desde: Date; hasta: Date | null; previas: MitigacionPreviaInput[] }

function excepcion(codigo: string, motivo: string): ResultadoConstruccion {
  return { ok: false, codigo, motivo }
}

function detectarCiclos(inc: IncidenteMigracionInput): { ciclos: Ciclo[] } | ResultadoConstruccion {
  const horaRegistro = toDate(inc.horaRegistro)
  const original = inc.horaRegistroOriginal ? toDate(inc.horaRegistroOriginal) : null
  const nuncaReabierto = !original || original.getTime() === horaRegistro.getTime()

  if (nuncaReabierto) {
    return { ciclos: [{ desde: horaRegistro, hasta: inc.horaFin ? toDate(inc.horaFin) : null, previas: [] }] }
  }

  if (!inc.horaFinAnterior) {
    return excepcion('REABERTURA_INCONSISTENTE', 'horaRegistroOriginal difiere de horaRegistro (fue reabierto) pero horaFinAnterior es null')
  }
  const horaFinAnterior = toDate(inc.horaFinAnterior)
  const previas = inc.mitigacionesPrevias ?? []
  const cerradoEnValores = Array.from(new Set(previas.map(p => toDate(p.cerradoEn).getTime())))

  if (cerradoEnValores.length > 1) {
    return excepcion('REABERTURAS_MULTIPLES', `${cerradoEnValores.length} cierres distintos detectados en mitigaciones_previas — el inicio de los ciclos intermedios no es reconstruible con los datos disponibles`)
  }
  if (cerradoEnValores.length === 1 && cerradoEnValores[0] !== horaFinAnterior.getTime()) {
    return excepcion('CERRADO_EN_INCONSISTENTE', 'el cerradoEn de mitigaciones_previas no coincide con horaFinAnterior')
  }

  return {
    ciclos: [
      { desde: original!, hasta: horaFinAnterior, previas },
      { desde: horaRegistro, hasta: inc.horaFin ? toDate(inc.horaFin) : null, previas: [] },
    ],
  }
}

// ─── Candidatos por ciclo ───────────────────────────────────────────────────

function candidatosDeCicloPrevio(ciclo: Ciclo): Candidato[] {
  return ciclo.previas.map(p => {
    const desde = toDate(p.horaActivacion)
    const hasta = p.horaDesactivacion ? toDate(p.horaDesactivacion) : toDate(p.cerradoEn)
    return {
      tipo: p.clase, factor: normContFactor(p.rendimiento),
      desde, hasta,
      activadoPor: p.activadoPor ?? null, observacion: p.observacion ?? null,
      routerExternoId: p.routerExternoId ?? null,
    }
  })
}

function candidatosDeCicloActual(inc: IncidenteMigracionInput, cicloDesde: Date): Candidato[] {
  const candidatos: Candidato[] = []
  if (inc.tipo !== 'CORTE_ELECTRICO') {
    if (inc.contActivadoPor) {
      candidatos.push({
        tipo: inc.contEsExterno ? 'ROUTER_EXTERNO' : 'ROUTER_PROPIO',
        factor: normContFactor(inc.contRendimiento),
        desde: toDate(inc.contHoraActivacion ?? cicloDesde),
        hasta: inc.contHoraDesactivacion ? toDate(inc.contHoraDesactivacion) : null,
        activadoPor: inc.contActivadoPor, observacion: inc.contObservacion,
        routerExternoId: inc.routerExternoId,
      })
    }
    if (inc.movActivadoPor) {
      candidatos.push({
        tipo: 'DATOS_MOVILES',
        factor: normContFactor(inc.movRendimiento),
        desde: toDate(inc.movHoraActivacion ?? cicloDesde),
        hasta: inc.movHoraDesactivacion ? toDate(inc.movHoraDesactivacion) : null,
        activadoPor: inc.movActivadoPor, observacion: inc.movObservacion,
        routerExternoId: null,
      })
    }
  }
  if (inc.boletaManual) {
    candidatos.push({
      tipo: 'BOLETA_MANUAL',
      factor: normBoletaFactor(inc.boletaRendimiento, inc.tipo),
      desde: toDate(inc.boletaHoraActivacion ?? cicloDesde),
      hasta: null,
      activadoPor: null, observacion: null, routerExternoId: null,
    })
  }
  return candidatos
}

// ─── Función principal ──────────────────────────────────────────────────────

export function construirTramosIncidente(
  inc: IncidenteMigracionInput,
  tienda: TiendaVentaInput,
  ahora: Date = new Date(),
): ResultadoConstruccion {
  const deteccion = detectarCiclos(inc)
  if ('ok' in deteccion) return deteccion
  const { ciclos } = deteccion

  const reabierto = ciclos.length > 1
  if (reabierto && inc.boletaManual) {
    return excepcion('BOLETA_CON_REAPERTURA', 'boleta_manual está activo y el incidente fue reabierto — boleta no se archiva por ciclo en mitigaciones_previas, no se puede determinar a qué ciclo pertenece sin adivinar')
  }

  const todosLosTramos: TramoConstruido[] = []

  for (let i = 0; i < ciclos.length; i++) {
    const ciclo = ciclos[i]
    const esUltimo = i === ciclos.length - 1

    const candidatosCrudos = esUltimo
      ? candidatosDeCicloActual(inc, ciclo.desde)
      : candidatosDeCicloPrevio(ciclo)

    const candidatos = candidatosCrudos
      .map(c => clipCandidatoAlCiclo(c, ciclo.desde, ciclo.hasta))
      .filter(c => c.hasta === null || c.hasta.getTime() > c.desde.getTime())

    let ventaHoraCiclo: number | null
    try {
      ventaHoraCiclo = resolveVentaHora({ hora_registro: ciclo.desde, venta_hora_soles: tienda.venta_hora_soles, venta_hora_fds_soles: tienda.venta_hora_fds_soles, cluster: tienda.cluster })
    } catch (e: any) {
      return excepcion('ERROR_VENTA_HORA', e?.message ?? String(e))
    }
    if (!ventaHoraCiclo) {
      return excepcion('SIN_VENTA_HORA', 'la tienda no tiene venta_hora configurada ni cluster con fallback')
    }

    let tramosCiclo: TramoConstruido[]
    try {
      tramosCiclo = segmentarCiclo({
        cicloDesde: ciclo.desde, cicloHasta: ciclo.hasta, candidatos,
        tipoIncidente: inc.tipo, ventaHoraCiclo, ahora,
      })
    } catch (e: any) {
      return excepcion('ERROR_SEGMENTACION', e?.message ?? String(e))
    }
    todosLosTramos.push(...tramosCiclo)
  }

  return { ok: true, tramos: todosLosTramos }
}
