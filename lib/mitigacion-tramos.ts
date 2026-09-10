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

import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { incidenteMitigacionTramos } from '@/drizzle/schema'
import { diaSemanaLima } from '@/lib/impacto-calc'
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
