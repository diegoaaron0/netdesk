/**
 * mitigacion-tramos.ts — Fase 2 del rediseño de mitigaciones/IEI.
 *
 * Fuente única para el cálculo de IEI por tramo y para el criterio de
 * "¿está esta mitigación activa?". Reemplaza (a futuro, cuando el siguiente
 * paso conecte el endpoint) las 4 copias existentes: lib/impacto-calc.ts,
 * el panel "IEI en curso" del detalle de incidente, el ticker del dashboard
 * operativo, y lib/report-sql.ts. Todavía no está conectada a nada — ver
 * diseño de la iniciativa "Fase 2" para el plan completo.
 *
 * Cambios de negocio reales respecto a las copias viejas (confirmados):
 *   - La escala de efectividad (Efectivo/Parcial/Nulo → 0%/50%/100% de
 *     pérdida) es UNA sola, igual para las 4 mitigaciones. Boleta manual ya
 *     no tiene su propia escala (10%/30%) ni la excepción de corte eléctrico
 *     (0% especial) — esa distinción desaparece por completo.
 *   - FACTOR_BASE_SIN_MITIGACION es una tabla explícita: un tipo de incidente
 *     que no esté en ella lanza un error, nunca cae a un valor por defecto.
 */

import { eq, and, isNull, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { incidenteMitigacionTramos } from '@/drizzle/schema'
import { diaSemanaLima, normContFactor, normBoletaFactor, resolveVentaHora } from '@/lib/impacto-calc'
import { DASHBOARD_CONFIG } from '@/lib/dashboard-config'

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TipoMitigacionTramo =
  | 'SIN_MITIGACION' | 'ROUTER_PROPIO' | 'ROUTER_EXTERNO' | 'DATOS_MOVILES' | 'BOLETA_MANUAL'

export interface TramoCalcInput {
  tipo: TipoMitigacionTramo
  desde: Date | string
  hasta: Date | string | null   // null = tramo abierto — se cierra en "ahora" al calcular
  /** Requerido solo cuando tipo === 'SIN_MITIGACION' (resuelve FACTOR_BASE_SIN_MITIGACION). */
  tipoIncidente?: string
  /** Factor ya resuelto (0-1) — forma en que vive el tramo una vez guardado en la tabla. */
  factor?: number | string | null
  /** Rendimiento categórico (EFECTIVO/PARCIAL/NULO) — alternativa a `factor` para mitigaciones activas. */
  rendimiento?: string | null
}

export interface TiendaVentaHoraInput {
  ventaHoraSoles?: number | string | null
  ventaHoraFdsSoles?: number | string | null
}

// ─── FACTOR_BASE_SIN_MITIGACION ─────────────────────────────────────────────
// Tabla explícita — 'POS' ya no existe como tipo de incidente (eliminado del
// enum). Cualquier tipo fuera de esta tabla es un error, no un fallback silencioso.

export const FACTOR_BASE_SIN_MITIGACION: Record<string, number> = {
  CAIDA_TOTAL:     1.00,
  INTERMITENCIA:   0.50,
  LENTITUD:        0.30,
  OTROS:           1.00,
  CORTE_ELECTRICO: 1.00,
}

export function factorBaseSinMitigacion(tipoIncidente: string): number {
  if (!(tipoIncidente in FACTOR_BASE_SIN_MITIGACION)) {
    throw new Error(`factorBaseSinMitigacion: tipo de incidente no reconocido: "${tipoIncidente}"`)
  }
  return FACTOR_BASE_SIN_MITIGACION[tipoIncidente]
}

// ─── Escala global de efectividad (las 4 mitigaciones, sin excepción) ───────

export function normFactorMitigacion(rendimiento: string | null | undefined): number {
  if (!rendimiento) return 0.50 // activada pero sin rendimiento registrado → parcial
  const r = rendimiento.toUpperCase()
  if (r === 'EFECTIVO') return 0.00
  if (r === 'PARCIAL')  return 0.50
  return 1.00 // NULO (o cualquier valor no reconocido)
}

function resolveFactorTramo(tramo: TramoCalcInput): number {
  if (tramo.tipo === 'SIN_MITIGACION') {
    if (!tramo.tipoIncidente) {
      throw new Error('calcIeTramo: falta tipoIncidente para resolver el factor de un tramo SIN_MITIGACION')
    }
    return factorBaseSinMitigacion(tramo.tipoIncidente)
  }
  if (tramo.factor != null) return Number(tramo.factor)
  if (tramo.rendimiento !== undefined) return normFactorMitigacion(tramo.rendimiento)
  throw new Error(`calcIeTramo: falta factor o rendimiento para resolver el tramo (tipo=${tramo.tipo})`)
}

// ─── calcIeTramo ─────────────────────────────────────────────────────────────

/**
 * IEI de UN tramo: venta_hora × horas_del_tramo × margen_bruto × factor.
 * La tarifa L-J/V-D se elige según el día en que EMPIEZA el tramo, en hora
 * Lima (reusa diaSemanaLima — no se reimplementa la conversión de zona).
 * `ahora` es el instante a usar si el tramo sigue abierto (hasta = null);
 * se recibe como parámetro (no Date.now() interno) para que el cálculo sea
 * determinista y testeable.
 */
export function calcIeTramo(tramo: TramoCalcInput, tienda: TiendaVentaHoraInput, ahora: Date = new Date()): number {
  const desdeMs = new Date(tramo.desde).getTime()
  const hastaMs = tramo.hasta ? new Date(tramo.hasta).getTime() : ahora.getTime()
  const horas = Math.max(0, (hastaMs - desdeMs) / 3600000)

  const dow = diaSemanaLima(new Date(tramo.desde))
  const isFDS = dow === 0 || dow === 5 || dow === 6
  const ventaHora = isFDS
    ? Number(tienda.ventaHoraFdsSoles ?? tienda.ventaHoraSoles ?? 0)
    : Number(tienda.ventaHoraSoles ?? tienda.ventaHoraFdsSoles ?? 0)

  const factor = resolveFactorTramo(tramo)
  return Math.round(ventaHora * horas * DASHBOARD_CONFIG.MARGEN_BRUTO * factor)
}

// ─── estaActivo ──────────────────────────────────────────────────────────────

/**
 * Criterio único de "¿está esta mitigación activa?": existe un tramo con ese
 * incidente_id, ese tipo, y hasta IS NULL. Reemplaza las 3 variantes viejas
 * (gateo por activado_por, por timestamp, y el fallback especial de boleta).
 */
export async function estaActivo(incidenteId: string, tipo: TipoMitigacionTramo): Promise<boolean> {
  const [row] = await db.select({ id: incidenteMitigacionTramos.id })
    .from(incidenteMitigacionTramos)
    .where(and(
      eq(incidenteMitigacionTramos.incidenteId, incidenteId),
      eq(incidenteMitigacionTramos.tipo, tipo),
      isNull(incidenteMitigacionTramos.hasta),
    ))
  return !!row
}

// ─── sumIeiTramos ────────────────────────────────────────────────────────────

/**
 * IEI total de un incidente: suma de ie_tramo de todos sus tramos. Un tramo
 * todavía abierto tiene ie_tramo NULL y aporta 0 — la suma solo refleja lo ya
 * sellado (correcto para incidentes cerrados; Fase 2 aún no expone esto como
 * el total oficial en ningún endpoint — eso es un paso posterior).
 */
export async function sumIeiTramos(incidenteId: string): Promise<number> {
  const rows = await db.select({ ieTramo: incidenteMitigacionTramos.ieTramo })
    .from(incidenteMitigacionTramos)
    .where(eq(incidenteMitigacionTramos.incidenteId, incidenteId))
  return rows.reduce((sum, r) => sum + Number(r.ieTramo ?? 0), 0)
}

// ─── validarActivacionMitigacion ────────────────────────────────────────────

/**
 * CORTE_ELECTRICO excluye router y datos móviles — solo BOLETA_MANUAL (y
 * SIN_MITIGACION) tienen sentido en ese tipo de incidente. Vive aquí, junto
 * al resto de la lógica de tramos, para que el endpoint de "activar/cambiar
 * mitigación" (siguiente paso) la use antes de escribir cualquier tramo,
 * en vez de solo ignorar la mitigación inválida en la fórmula como hacía
 * el modelo viejo.
 */
export function validarActivacionMitigacion(tipoIncidente: string, tipoMitigacion: TipoMitigacionTramo): void {
  const excluidosEnCorte: TipoMitigacionTramo[] = ['ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES']
  if (tipoIncidente === 'CORTE_ELECTRICO' && excluidosEnCorte.includes(tipoMitigacion)) {
    throw new Error(`No se puede activar ${tipoMitigacion} en un incidente CORTE_ELECTRICO — solo BOLETA_MANUAL aplica`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fase 5, Paso 2.1 — las 3 funciones centrales
//
// Reemplazan (desde el punto de vista de quien las consume) a calcImpactoRow,
// calcImpactoEnCurso (lib/impacto-calc.ts) y calcIeiEnCurso (página de detalle
// de incidente) — las 3 copias vivas de la fórmula vieja que quedaban fuera de
// esta iniciativa. La aritmética "sin tramos" (normalizarMitigaciones +
// calcIeiIncidente) es una reimplementación deliberada sobre una forma de datos
// común, NO un simple wrapper de las funciones viejas — así, cuando el último
// consumidor legacy se migre, esas 3 funciones quedan sin uso y se pueden
// borrar. Por eso cada rama de esta reimplementación tiene tests que comparan
// el número contra las funciones viejas para el mismo input (ver
// mitigacion-tramos.test.ts) — es la única forma de garantizar que no cambió
// ningún resultado.
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentoMitigacion {
  tipo: TipoMitigacionTramo
  desde: Date
  hasta: Date | null           // null = sigue abierto (incidente aún activo)
  rendimiento: string | null   // crudo (EFECTIVO/PARCIAL/NULO/legacy) — null en SIN_MITIGACION
  origen: 'TRAMO' | 'LEGACY'
}

/** Forma mínima de un incidente que necesitan normalizarMitigaciones/calcIeiIncidente.
 *  Cubre tanto los campos legacy (cont_, mov_, boleta_, mitigaciones_previas) como
 *  los que ya usa calcIeTramo (tipo, para SIN_MITIGACION). Los nombres son camelCase
 *  porque las filas vienen de Drizzle o de un SELECT ya mapeado — no de SQL crudo. */
export interface IncidenteMitigacionInput {
  tipo: string
  estado: string
  horaRegistro: Date | string
  horaFin?: Date | string | null
  ieiAcumulado?: number | string | null

  contActivadoPor?: string | null
  contHoraActivacion?: Date | string | null
  contHoraDesactivacion?: Date | string | null
  contRendimiento?: string | null
  contEsExterno?: boolean | null

  movActivadoPor?: string | null
  movHoraActivacion?: Date | string | null
  movHoraDesactivacion?: Date | string | null
  movRendimiento?: string | null

  boletaManual?: boolean | null
  boletaRendimiento?: string | null
  boletaHoraActivacion?: Date | string | null

  // Periodos archivados de ciclos anteriores a una reapertura (ver reabrir/route.ts).
  // Solo router/datos móviles se archivan ahí — boleta nunca. Cada entrada:
  // { clase, activadoPor, horaActivacion, horaDesactivacion, rendimiento, ... }
  mitigacionesPrevias?: any[] | null
}

export interface TramoRow {
  incidenteId?: string
  tipo: TipoMitigacionTramo
  factor: string | number
  desde: Date | string
  hasta: Date | string | null
  ieTramo?: string | number | null
}

export interface TiendaVentaHoraLegacyInput {
  ventaHoraSoles?: number | string | null
  ventaHoraFdsSoles?: number | string | null
  cluster?: string | null
}

function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

// Tabla vieja de impacto-calc.ts (FACTOR_BASE, no exportada) — deliberadamente
// NO se usa factorBaseSinMitigacion() acá: esa lanza para un tipo no reconocido
// (comportamiento nuevo, correcto para tramos), pero la rama legacy tiene que
// preservar el comportamiento viejo tal cual, que caía a 1.00 en silencio para
// cualquier tipo fuera de la tabla (p.ej. OTROS).
const LEGACY_FACTOR_BASE: Record<string, number> = {
  CAIDA_TOTAL: 1.00, INTERMITENCIA: 0.50, LENTITUD: 0.30, CORTE_ELECTRICO: 1.00,
}

const CLASES_ARCHIVABLES: TipoMitigacionTramo[] = ['ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES']

/**
 * Normaliza la mitigación de un incidente a una lista de segmentos, sin importar
 * si viene de la tabla de tramos o de los campos legacy (cont_, mov_, boleta_).
 *
 * Con tramos: los mapea 1:1 (ya vienen resueltos, incluyendo SIN_MITIGACION explícito).
 *
 * Sin tramos: los deriva de los campos legacy, replicando EXACTAMENTE los gates
 * que ya usan calcImpactoRow/calcImpactoEnCurso/calcIeiEnCurso:
 *   - cont_activado_por/mov_activado_por como guardia de su propia hora_activacion
 *     (un timestamp sin su "activado_por" no cuenta — bug real de producción).
 *   - boleta_hora_activacion cae al inicio del incidente si no está seteada.
 *   - router y datos móviles NO se materializan en CORTE_ELECTRICO (ahí solo
 *     cuenta la boleta) — igual que la rama CORTE_ELECTRICO de esas 3 funciones.
 *   - mitigaciones_previas (periodos ya cerrados de una reapertura) se agregan
 *     como segmentos cerrados adicionales.
 * Los huecos sin ninguna mitigación real se rellenan con SIN_MITIGACION, así el
 * resultado tiene cobertura completa de [horaRegistro, límite] — un tramo
 * abierto (hasta=null) solo puede quedar al final, y solo si el incidente
 * mismo sigue abierto.
 */
export function normalizarMitigaciones(
  incidente: IncidenteMitigacionInput,
  tramos: TramoRow[],
): SegmentoMitigacion[] {
  if (tramos.length > 0) {
    return tramos
      .slice()
      .sort((a, b) => new Date(a.desde).getTime() - new Date(b.desde).getTime())
      .map((t): SegmentoMitigacion => ({
        tipo: t.tipo,
        desde: new Date(t.desde),
        hasta: t.hasta ? new Date(t.hasta) : null,
        rendimiento: null, // el factor de un tramo ya viene resuelto en t.factor — no necesita rendimiento
        origen: 'TRAMO',
      }))
  }

  const incStart = toDateOrNull(incidente.horaRegistro)
  if (!incStart) return []
  const resuelto = incidente.estado === 'RESUELTO'
  const incEnd = resuelto ? toDateOrNull(incidente.horaFin) : null
  const esCorte = incidente.tipo === 'CORTE_ELECTRICO'

  const segmentos: SegmentoMitigacion[] = []

  if (!esCorte) {
    if (incidente.contActivadoPor) {
      segmentos.push({
        tipo: incidente.contEsExterno ? 'ROUTER_EXTERNO' : 'ROUTER_PROPIO',
        desde: toDateOrNull(incidente.contHoraActivacion) ?? incStart,
        hasta: toDateOrNull(incidente.contHoraDesactivacion),
        rendimiento: incidente.contRendimiento ?? null,
        origen: 'LEGACY',
      })
    }
    if (incidente.movActivadoPor) {
      segmentos.push({
        tipo: 'DATOS_MOVILES',
        desde: toDateOrNull(incidente.movHoraActivacion) ?? incStart,
        hasta: toDateOrNull(incidente.movHoraDesactivacion),
        rendimiento: incidente.movRendimiento ?? null,
        origen: 'LEGACY',
      })
    }
  }

  if (incidente.boletaManual) {
    segmentos.push({
      tipo: 'BOLETA_MANUAL',
      desde: toDateOrNull(incidente.boletaHoraActivacion) ?? incStart,
      hasta: null, // la boleta legacy no tiene su propia hora de desactivación — cubre hasta el cierre
      rendimiento: incidente.boletaRendimiento ?? null,
      origen: 'LEGACY',
    })
  }

  if (!esCorte && Array.isArray(incidente.mitigacionesPrevias)) {
    for (const prev of incidente.mitigacionesPrevias) {
      if (!prev || !CLASES_ARCHIVABLES.includes(prev.clase)) continue
      const desde = toDateOrNull(prev.horaActivacion)
      if (!desde) continue
      segmentos.push({
        tipo: prev.clase,
        desde,
        hasta: toDateOrNull(prev.horaDesactivacion),
        rendimiento: prev.rendimiento ?? null,
        origen: 'LEGACY',
      })
    }
  }

  // Un segmento sin `hasta` en un incidente ya RESUELTO no puede seguir "abierto"
  // para siempre — se sella en horaFin (mismo tope que usa isActiveAt en
  // calcImpactoRow). Si el incidente sigue ABIERTO, hasta=null se conserva.
  for (const s of segmentos) {
    if (s.hasta === null && incEnd) s.hasta = incEnd
  }

  // Relleno de huecos con SIN_MITIGACION — cobertura completa de [incStart, límite].
  const limite = incEnd // null si el incidente sigue abierto
  const puntos = new Set<number>([incStart.getTime()])
  if (limite) puntos.add(limite.getTime())
  for (const s of segmentos) {
    puntos.add(s.desde.getTime())
    if (s.hasta) puntos.add(s.hasta.getTime())
  }
  const ordenados = [...puntos].sort((a, b) => a - b)
  for (let i = 0; i < ordenados.length - 1; i++) {
    const desdeMs = ordenados[i], hastaMs = ordenados[i + 1]
    const cubierto = segmentos.some(s => s.desde.getTime() <= desdeMs && s.hasta !== null && s.hasta.getTime() >= hastaMs)
    if (!cubierto) {
      segmentos.push({ tipo: 'SIN_MITIGACION', desde: new Date(desdeMs), hasta: new Date(hastaMs), rendimiento: null, origen: 'LEGACY' })
    }
  }
  // Tramo final abierto: si el incidente sigue en curso y nada real lo cubre
  // desde el último punto conocido en adelante, se deja un SIN_MITIGACION abierto.
  if (!limite && ordenados.length > 0) {
    const ultimo = ordenados[ordenados.length - 1]
    const cubiertoAbierto = segmentos.some(s => s.hasta === null && s.desde.getTime() <= ultimo)
    if (!cubiertoAbierto) {
      segmentos.push({ tipo: 'SIN_MITIGACION', desde: new Date(ultimo), hasta: null, rendimiento: null, origen: 'LEGACY' })
    }
  }

  return segmentos.sort((a, b) => a.desde.getTime() - b.desde.getTime())
}

function resolverFactorSegmentoLegacy(s: SegmentoMitigacion, tipoIncidente: string): number {
  if (s.tipo === 'SIN_MITIGACION') return LEGACY_FACTOR_BASE[tipoIncidente] ?? 1.00
  if (s.tipo === 'BOLETA_MANUAL') return normBoletaFactor(s.rendimiento, tipoIncidente)
  return normContFactor(s.rendimiento) // ROUTER_PROPIO / ROUTER_EXTERNO / DATOS_MOVILES
}

/** Aritmética "mínimo factor si hay solapamiento" — idéntica a la de calcImpactoRow/
 *  calcImpactoEnCurso, pero operando sobre segmentos ya normalizados en vez de leer
 *  los campos crudos directamente. Devuelve el total SIN redondear (el redondeo es
 *  responsabilidad de calcIeiIncidente, una sola vez por período). */
function calcIeiLegacySobreSegmentos(
  segmentos: SegmentoMitigacion[],
  tipoIncidente: string,
  incStart: Date,
  boundary: Date,
  ventaHora: number,
): number {
  const startMs = incStart.getTime()
  const endMs = boundary.getTime()
  if (endMs <= startMs) return 0
  const puntos = new Set<number>([startMs, endMs])
  for (const s of segmentos) {
    const d = s.desde.getTime()
    const h = (s.hasta ?? boundary).getTime()
    if (d > startMs && d < endMs) puntos.add(d)
    if (h > startMs && h < endMs) puntos.add(h)
  }
  const bps = [...puntos].sort((a, b) => a - b)
  let total = 0
  for (let i = 0; i < bps.length - 1; i++) {
    const segStart = bps[i], segEnd = bps[i + 1]
    const mid = (segStart + segEnd) / 2
    const horas = (segEnd - segStart) / 3600000
    const activos = segmentos.filter(s => {
      const d = s.desde.getTime()
      const h = (s.hasta ?? boundary).getTime()
      return mid >= d && mid < h
    })
    const factor = activos.length > 0
      ? Math.min(...activos.map(s => resolverFactorSegmentoLegacy(s, tipoIncidente)))
      : (LEGACY_FACTOR_BASE[tipoIncidente] ?? 1.00) // no debería ocurrir — normalizarMitigaciones ya rellena huecos
    total += ventaHora * horas * DASHBOARD_CONFIG.MARGEN_BRUTO * factor
  }
  return total
}

export interface CalcIeiIncidenteResult {
  iei: number
  segmentos: SegmentoMitigacion[]
}

/**
 * IEI de un incidente puntual — reemplaza a calcImpactoRow + calcImpactoEnCurso +
 * calcIeiEnCurso. Dispatch:
 *   - Con tramos: SUM(ie_tramo de los cerrados) + calcIeTramo del abierto (si hay).
 *   - Sin tramos: normalizarMitigaciones + la misma aritmética de "mínimo factor
 *     con solapamiento" de siempre, con RESUELTO usando hora_fin como límite y
 *     ABIERTO usando `ahora`.
 * En ambos casos se suma ieiAcumulado (IEI ya cerrado de ciclos previos a una
 * reapertura) — igual que hacen hoy los consumidores (`res.impactoEstimado + ieiAcum`).
 */
export function calcIeiIncidente(
  incidente: IncidenteMitigacionInput,
  tramos: TramoRow[],
  ventaTienda: TiendaVentaHoraLegacyInput,
  ahora: Date = new Date(),
): CalcIeiIncidenteResult {
  const ieiAcumulado = Number(incidente.ieiAcumulado ?? 0)

  if (tramos.length > 0) {
    const segmentos = normalizarMitigaciones(incidente, tramos)
    let iei = 0
    for (const t of tramos) {
      if (t.hasta != null) {
        iei += Number(t.ieTramo ?? 0)
      } else {
        iei += calcIeTramo(
          { tipo: t.tipo, factor: t.factor, desde: t.desde, hasta: null, tipoIncidente: incidente.tipo },
          { ventaHoraSoles: ventaTienda.ventaHoraSoles, ventaHoraFdsSoles: ventaTienda.ventaHoraFdsSoles },
          ahora,
        )
      }
    }
    return { iei: Math.round(iei) + ieiAcumulado, segmentos }
  }

  const segmentos = normalizarMitigaciones(incidente, [])
  const incStart = toDateOrNull(incidente.horaRegistro)
  if (!incStart) return { iei: ieiAcumulado, segmentos }

  const resuelto = incidente.estado === 'RESUELTO'
  const horaFin = toDateOrNull(incidente.horaFin)
  if (resuelto && !horaFin) return { iei: ieiAcumulado, segmentos } // igual que calcImpactoRow: sin hora_fin, no calcula
  const boundary = resuelto ? horaFin! : ahora
  if (boundary.getTime() <= incStart.getTime()) return { iei: ieiAcumulado, segmentos }

  const ventaHora = resolveVentaHora({
    hora_registro: incidente.horaRegistro,
    venta_hora_soles: ventaTienda.ventaHoraSoles,
    venta_hora_fds_soles: ventaTienda.ventaHoraFdsSoles,
    cluster: ventaTienda.cluster,
  })
  if (!ventaHora) return { iei: ieiAcumulado, segmentos }

  const iei = calcIeiLegacySobreSegmentos(segmentos, incidente.tipo, incStart, boundary, ventaHora)
  return { iei: Math.round(iei) + ieiAcumulado, segmentos }
}

/**
 * Trae los tramos de una lista de incidentes en una sola query (evita N+1 en
 * listas y reportes). `soloAbiertos` filtra a `hasta IS NULL`, aprovechando el
 * índice único parcial `idx_tramos_un_abierto_por_incidente`.
 */
export async function getTramosPorIncidentes(
  incidenteIds: string[],
  opts: { soloAbiertos?: boolean } = {},
): Promise<Map<string, TramoRow[]>> {
  const mapa = new Map<string, TramoRow[]>()
  if (incidenteIds.length === 0) return mapa

  const condicion = opts.soloAbiertos
    ? and(inArray(incidenteMitigacionTramos.incidenteId, incidenteIds), isNull(incidenteMitigacionTramos.hasta))
    : inArray(incidenteMitigacionTramos.incidenteId, incidenteIds)

  const rows = await db.select().from(incidenteMitigacionTramos)
    .where(condicion)
    .orderBy(asc(incidenteMitigacionTramos.desde))

  for (const r of rows) {
    if (!mapa.has(r.incidenteId)) mapa.set(r.incidenteId, [])
    mapa.get(r.incidenteId)!.push(r)
  }
  return mapa
}
