import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

/** Severidades de la sección Alertas del dashboard operativo. Los colores
 *  viven en la UI; acá sólo el nivel, para poder testear sin tocar estilos. */
export type SeveridadAlerta = 'ROJO' | 'NARANJA' | 'AMARILLO' | 'INFO'

const ORDEN_SEVERIDAD: Record<SeveridadAlerta, number> = { ROJO: 0, NARANJA: 1, AMARILLO: 2, INFO: 3 }

export interface Alerta {
  /** Clave estable (tipo + entidad): sirve de key en React y evita duplicados. */
  id: string
  tipo: string
  severidad: SeveridadAlerta
  texto: string
  /** Navegación al incidente / tienda / acción / ficha afectada. */
  href?: string
  /** Alternativa a href: filtrar la cola del propio dashboard. */
  filterKey?: string
  provFilter?: string
  agenteId?: string
  accion?: string
}

/** Minutos → "1h 23min" / "45min". */
export function fmtDuracion(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto === 0 ? `${h}h` : `${h}h ${resto}min`
}

/** Umbrales progresivos de "incidente abierto mucho tiempo" (alerta 3).
 *  Sólo dispara el más alto alcanzado: un incidente de 50h genera UNA alerta,
 *  no seis. */
export const UMBRALES_ABIERTO: { horas: number; severidad: SeveridadAlerta }[] = [
  { horas: 2,  severidad: 'AMARILLO' },
  { horas: 4,  severidad: 'AMARILLO' },
  { horas: 8,  severidad: 'NARANJA'  },
  { horas: 16, severidad: 'NARANJA'  },
  { horas: 24, severidad: 'ROJO'     },
  { horas: 48, severidad: 'ROJO'     },
]

/** Umbrales de "contrato por vencer" (alerta 9). Igual que arriba: sólo el más
 *  cercano al vencimiento. */
export const UMBRALES_CONTRATO: { dias: number; severidad: SeveridadAlerta }[] = [
  { dias: 7,  severidad: 'ROJO'     },
  { dias: 15, severidad: 'NARANJA'  },
  { dias: 30, severidad: 'AMARILLO' },
  { dias: 60, severidad: 'INFO'     },
]

/** Minutos antes del vencimiento del SLA en que se avisa (alerta 2). */
export const SLA_AVISO_MIN = 30
/** Minutos sin descartes registrados que disparan la alerta 6. */
export const SIN_DESCARTES_MIN = 30
/** Minutos sin mitigación activa que disparan la alerta 1. */
export const SIN_MITIGACION_MIN = 60
/** Incidentes activos simultáneos del mismo proveedor que disparan la alerta 10. */
export const PROVEEDOR_MULTIPLE_MIN = 3
/** Minutos sin respuesta del proveedor, desde el envío del correo (alerta 13). */
export const PROVEEDOR_SIN_RESPUESTA_MIN = 4 * 60
/** Casos activos de un agente que disparan la alerta 12. */
export const AGENTE_SOBRECARGA_MIN = 4
/** Ventana de novedad para escalamientos y reaperturas (alertas 4 y 5). */
export const VENTANA_NOVEDAD_MS = 24 * 60 * 60 * 1000

export interface AlertasData {
  evaluacionesPendientes?: any[]
  contratosPorVencer?: any[]
  contratosCobertura?: { fichasActivas: number; conFechaFin: number }
  tiendasSinVenta?: number
}

function minutosDesde(valor: any, nowMs: number): number | null {
  if (!valor) return null
  const ms = new Date(valor).getTime()
  if (Number.isNaN(ms)) return null
  return (nowMs - ms) / 60000
}

/** Construye la lista completa de alertas del dashboard operativo.
 *  Función pura: recibe lo que el endpoint ya devuelve y el instante actual.
 *  Reemplaza al buildAlertas viejo (SLA agregado + pendientes proveedor +
 *  sobrecarga de agente); las dos primeras quedaron absorbidas por las alertas
 *  por incidente, que además linkean al caso concreto. */
export function buildAlertas(
  activos: any[],
  equipo: any[],
  data: AlertasData,
  nowMs: number,
): Alerta[] {
  const alertas: Alerta[] = []
  const push = (a: Alerta) => { alertas.push(a) }

  for (const inc of activos ?? []) {
    const codigo   = inc.codigo ?? inc.id
    const href     = `/incidentes/${inc.id}`
    const tienda   = inc.tienda_codigo ?? ''
    const minutos  = minutosDesde(inc.hora_registro, nowMs) ?? 0

    // 1 — sin mitigación activa hace más de 1 hora
    const sinMitMin = minutosDesde(inc.sinMitigacionDesde, nowMs)
    if (sinMitMin != null && sinMitMin >= SIN_MITIGACION_MIN) {
      push({
        id: `sin_mitigacion:${inc.id}`, tipo: 'SIN_MITIGACION', severidad: 'NARANJA',
        texto: `${codigo} lleva ${fmtDuracion(sinMitMin)} sin mitigación activa`,
        href, accion: 'Ver incidente',
      })
    }

    // 2 — SLA vencido / por vencer. Mismo reloj que la cola: desde
    // hora_registro contra el SLA de resolución (override de ficha si hay).
    const slaLimite = Number(inc.sla_resolucion_override ?? SLA_RESOLUCION_DEFAULT_MIN)
    const restante  = slaLimite - minutos
    if (restante <= 0) {
      push({
        id: `sla_vencido:${inc.id}`, tipo: 'SLA_VENCIDO', severidad: 'ROJO',
        texto: `${codigo} superó el SLA hace ${fmtDuracion(-restante)}`,
        href, accion: 'Ver incidente',
      })
    } else if (restante <= SLA_AVISO_MIN) {
      push({
        id: `sla_por_vencer:${inc.id}`, tipo: 'SLA_POR_VENCER', severidad: 'NARANJA',
        texto: `${codigo} vence el SLA en ${Math.ceil(restante)}min`,
        href, accion: 'Ver incidente',
      })
    }

    // 3 — abierto mucho tiempo, sólo el umbral más alto alcanzado
    const alcanzado = [...UMBRALES_ABIERTO].reverse().find(u => minutos >= u.horas * 60)
    if (alcanzado) {
      push({
        id: `tiempo_abierto:${inc.id}`, tipo: 'TIEMPO_ABIERTO', severidad: alcanzado.severidad,
        texto: `${codigo} lleva ${fmtDuracion(minutos)} sin resolverse (+${alcanzado.horas}h)`,
        href, accion: 'Ver incidente',
      })
    }

    // 4 — escalado a Infraestructura en las últimas 24h
    const escaladoMs = inc.hora_escalado_infra ? new Date(inc.hora_escalado_infra).getTime() : null
    if (inc.escalado_infra_id && escaladoMs != null && nowMs - escaladoMs <= VENTANA_NOVEDAD_MS) {
      const quien = inc.infra_nombre ? ` (${inc.infra_nombre})` : ''
      push({
        id: `escalado_infra:${inc.id}`, tipo: 'ESCALADO_INFRA', severidad: 'INFO',
        texto: `${codigo} fue escalado a Infraestructura${quien}`,
        href, accion: 'Ver incidente',
      })
    }

    // 5 — reabierto en las últimas 24h. Reabrir reinicia hora_registro, así
    // que ese mismo campo marca el momento de la reapertura.
    if (inc.motivo_reabertura && minutos * 60000 <= VENTANA_NOVEDAD_MS) {
      const motivo = inc.motivo_reabertura === 'TIENDA_SIN_INTERNET' ? 'la tienda sigue sin internet' : 'error del agente'
      push({
        id: `reabierto:${inc.id}`, tipo: 'REABIERTO', severidad: 'NARANJA',
        texto: `${codigo} fue reabierto — ${motivo}`,
        href, accion: 'Ver incidente',
      })
    }

    // 6 — sin descartes después de 30 min. null = nunca se respondió; un
    // false ya es diagnóstico hecho, así que sólo cuenta el todo-null.
    const sinDescartes = inc.desc_energia == null && inc.desc_router == null
      && inc.desc_cableado == null && inc.desc_reinicio_equipo == null
    if (sinDescartes && minutos >= SIN_DESCARTES_MIN) {
      push({
        id: `sin_descartes:${inc.id}`, tipo: 'SIN_DESCARTES', severidad: 'AMARILLO',
        texto: `${codigo} lleva ${fmtDuracion(minutos)} sin descartes registrados`,
        href, accion: 'Ver checklist',
      })
    }

    // 7 — la tienda no tiene con qué hacer contingencia. En CORTE_ELECTRICO un
    // router no sirve de nada (validarActivacionMitigacion ya lo excluye), y si
    // el incidente ya tiene router activo no hay nada que coordinar.
    const yaTieneRouterActivo = !!(inc.cont_activado_por && !inc.cont_hora_desactivacion)
    if (inc.tipo !== 'CORTE_ELECTRICO' && !yaTieneRouterActivo
        && !inc.tienda_tiene_contingencia && !inc.tienda_tiene_router_externo) {
      push({
        id: `sin_router:${inc.id}`, tipo: 'SIN_ROUTER_CONTINGENCIA', severidad: 'NARANJA',
        texto: `${tienda} tiene un incidente activo y no tiene router de contingencia`,
        href: inc.tienda_id ? `/tiendas/${inc.tienda_id}` : href, accion: 'Ver tienda',
      })
    }

    // 13 — el proveedor no responde, medido desde el envío del correo de
    // escalamiento (no desde hora_registro, que era lo que medía la alerta
    // vieja "sin respuesta de X hace N" pese a lo que decía su texto).
    const esperandoMin = minutosDesde(inc.esperando_proveedor_desde, nowMs)
    if (esperandoMin != null && esperandoMin >= PROVEEDOR_SIN_RESPUESTA_MIN) {
      const prov = inc.proveedor_nombre ?? 'El proveedor'
      push({
        id: `prov_sin_resp:${inc.id}`, tipo: 'PROVEEDOR_SIN_RESPUESTA', severidad: 'NARANJA',
        texto: `${prov} no responde ${codigo} hace ${fmtDuracion(esperandoMin)}`,
        href, accion: 'Ver incidente',
      })
    }
  }

  // 10 — proveedor con varios incidentes activos a la vez
  const porProveedor = new Map<string, number>()
  for (const inc of activos ?? []) {
    const prov = inc.proveedor_nombre
    if (!prov) continue
    porProveedor.set(prov, (porProveedor.get(prov) ?? 0) + 1)
  }
  for (const [prov, n] of porProveedor) {
    if (n < PROVEEDOR_MULTIPLE_MIN) continue
    push({
      id: `prov_multiple:${prov}`, tipo: 'PROVEEDOR_MULTIPLE', severidad: n >= 5 ? 'ROJO' : 'NARANJA',
      texto: `${prov} tiene ${n} incidentes activos a la vez — posible falla sistémica`,
      filterKey: 'todos', provFilter: prov, accion: 'Ver casos',
    })
  }

  // 8 — evaluaciones de gestión de cambios vencidas
  for (const ev of data.evaluacionesPendientes ?? []) {
    const diasVencida = ev.fecha ? Math.floor((nowMs - new Date(ev.fecha + 'T00:00:00-05:00').getTime()) / 86400000) : 0
    push({
      id: `eval:${ev.id}:${ev.ventana}`, tipo: 'EVAL_PENDIENTE',
      severidad: diasVencida >= 15 ? 'ROJO' : 'AMARILLO',
      texto: `${ev.codigo}: evaluación de ${ev.ventana} días pendiente${diasVencida > 0 ? ` hace ${diasVencida}d` : ''}`,
      href: `/gestion-cambios/${ev.id}`, accion: 'Evaluar',
    })
  }

  // 9 — contratos por vencer, sólo el umbral más cercano por ficha
  for (const c of data.contratosPorVencer ?? []) {
    const dias = Number(c.dias_restantes)
    const umbral = UMBRALES_CONTRATO.find(u => dias <= u.dias)
    if (!umbral) continue
    const auto = c.renovacion_automatica ? ' (renovación automática)' : ''
    push({
      id: `contrato:${c.ficha_id}`, tipo: 'CONTRATO_POR_VENCER',
      severidad: c.renovacion_automatica ? 'INFO' : umbral.severidad,
      texto: `${c.tienda_codigo}: el contrato vence en ${dias}d${auto}`,
      href: `/gestion-cambios/fichas/${c.ficha_id}`, accion: 'Ver ficha',
    })
  }

  // 11 — tiendas sin venta configurada, agrupadas en una línea
  const sinVenta = data.tiendasSinVenta ?? 0
  if (sinVenta > 0) {
    push({
      id: 'tiendas_sin_venta', tipo: 'TIENDAS_SIN_VENTA', severidad: 'INFO',
      texto: `${sinVenta} tienda${sinVenta > 1 ? 's' : ''} sin venta configurada — su IEI no se puede calcular`,
      href: '/tiendas', accion: 'Ver tiendas',
    })
  }

  // 12 — agente sobrecargado (la única de las 3 alertas viejas que sobrevive:
  // habla de carga del equipo, que ninguna de las nuevas cubre)
  for (const ag of equipo ?? []) {
    if ((ag.casosActivos ?? 0) < AGENTE_SOBRECARGA_MIN) continue
    push({
      id: `agente:${ag.id}`, tipo: 'AGENTE_SOBRECARGADO', severidad: 'AMARILLO',
      texto: `${ag.nombre} tiene ${ag.casosActivos} casos activos`,
      agenteId: ag.id, accion: 'Ver carga',
    })
  }

  return alertas.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad])
}

/** Nota al pie de la sección cuando no hay fechas de vencimiento cargadas:
 *  sin esto, "0 contratos por vencer" se lee como "todo al día" cuando en
 *  realidad no hay dato. Al 10/09/2026 producción tiene 159 fichas activas y
 *  ninguna con fecha_fin. */
export function notaContratos(cobertura?: { fichasActivas: number; conFechaFin: number }): string | null {
  if (!cobertura || cobertura.fichasActivas === 0) return null
  if (cobertura.conFechaFin > 0) return null
  return `Sin datos de vencimiento cargados: ninguna de las ${cobertura.fichasActivas} fichas activas tiene fecha de fin.`
}
