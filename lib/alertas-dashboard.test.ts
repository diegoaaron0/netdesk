import { describe, it, expect } from 'vitest'
import { buildAlertas, fmtDuracion, notaContratos, type Alerta } from './alertas-dashboard'

const AHORA = new Date('2026-09-10T15:00:00.000Z').getTime()
const haceMin = (m: number) => new Date(AHORA - m * 60000).toISOString()

/** Incidente activo "limpio": recién registrado, con descartes respondidos,
 *  con contingencia disponible en la tienda. No dispara ninguna alerta. */
function incidente(over: Record<string, any> = {}) {
  return {
    id: 'inc-1', codigo: 'INC-00215', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
    hora_registro: haceMin(5),
    tienda_id: 'tid-1', tienda_codigo: 'T20', proveedor_nombre: 'CLARO',
    desc_energia: true, desc_router: true, desc_cableado: true, desc_reinicio_equipo: true,
    tienda_tiene_contingencia: true, tienda_tiene_router_externo: false,
    sinMitigacionDesde: null, esperando_proveedor_desde: null,
    escalado_infra_id: null, hora_escalado_infra: null, motivo_reabertura: null,
    cont_activado_por: 'AGENTE', cont_hora_desactivacion: null,
    sla_resolucion_override: null,
    ...over,
  }
}

const tipos = (as: Alerta[]) => as.map(a => a.tipo)
const del = (as: Alerta[], tipo: string) => as.filter(a => a.tipo === tipo)

describe('buildAlertas — incidente sin alertas', () => {
  it('un incidente recién registrado y bien atendido no genera ninguna alerta', () => {
    expect(buildAlertas([incidente()], [], {}, AHORA)).toEqual([])
  })
})

describe('alerta 1 — sin mitigación activa', () => {
  it('dispara pasada 1 hora, con el tiempo del tramo (no el del incidente)', () => {
    const as = buildAlertas([incidente({ hora_registro: haceMin(300), sinMitigacionDesde: haceMin(83) })], [], {}, AHORA)
    const a = del(as, 'SIN_MITIGACION')[0]
    expect(a.texto).toBe('INC-00215 lleva 1h 23min sin mitigación activa')
    expect(a.href).toBe('/incidentes/inc-1')
  })

  it('no dispara antes de la hora', () => {
    const as = buildAlertas([incidente({ sinMitigacionDesde: haceMin(59) })], [], {}, AHORA)
    expect(del(as, 'SIN_MITIGACION')).toHaveLength(0)
  })
})

describe('alerta 2 — SLA (mismo reloj que la cola: desde hora_registro)', () => {
  it('a 20 min del vencimiento avisa "por vencer"', () => {
    const as = buildAlertas([incidente({ hora_registro: haceMin(70) })], [], {}, AHORA)
    expect(del(as, 'SLA_POR_VENCER')[0].texto).toBe('INC-00215 vence el SLA en 20min')
    expect(del(as, 'SLA_VENCIDO')).toHaveLength(0)
  })

  it('pasado el límite avisa "vencido" en rojo, y ya no "por vencer"', () => {
    const as = buildAlertas([incidente({ hora_registro: haceMin(150) })], [], {}, AHORA)
    expect(del(as, 'SLA_POR_VENCER')).toHaveLength(0)
    const v = del(as, 'SLA_VENCIDO')[0]
    expect(v.severidad).toBe('ROJO')
    expect(v.texto).toBe('INC-00215 superó el SLA hace 1h')
  })

  it('respeta el SLA de la ficha cuando hay override', () => {
    // Override de 240 min: a los 150 min todavía faltan 90, no avisa nada.
    const as = buildAlertas([incidente({ hora_registro: haceMin(150), sla_resolucion_override: 240 })], [], {}, AHORA)
    expect(tipos(as)).not.toContain('SLA_VENCIDO')
    expect(tipos(as)).not.toContain('SLA_POR_VENCER')
  })

  it('a más de 30 min del vencimiento no avisa todavía', () => {
    const as = buildAlertas([incidente({ hora_registro: haceMin(55) })], [], {}, AHORA)
    expect(tipos(as)).not.toContain('SLA_POR_VENCER')
  })
})

describe('alerta 3 — tiempo abierto, sólo el umbral más alto', () => {
  it('un incidente de 50h genera UNA alerta, la de 48h, no seis', () => {
    const as = buildAlertas([incidente({ hora_registro: haceMin(50 * 60) })], [], {}, AHORA)
    const t = del(as, 'TIEMPO_ABIERTO')
    expect(t).toHaveLength(1)
    expect(t[0].texto).toContain('+48h')
    expect(t[0].severidad).toBe('ROJO')
  })

  it('la severidad sube con el tiempo', () => {
    const sev = (h: number) =>
      del(buildAlertas([incidente({ hora_registro: haceMin(h * 60) })], [], {}, AHORA), 'TIEMPO_ABIERTO')[0]?.severidad
    expect(sev(1)).toBeUndefined()
    expect(sev(2)).toBe('AMARILLO')
    expect(sev(8)).toBe('NARANJA')
    expect(sev(24)).toBe('ROJO')
  })
})

describe('alertas 4 y 5 — novedades con ventana de 24h', () => {
  it('escalamiento a infraestructura reciente aparece; el de hace 2 días no', () => {
    const reciente = buildAlertas([incidente({ escalado_infra_id: 'u1', infra_nombre: 'Edson', hora_escalado_infra: haceMin(30) })], [], {}, AHORA)
    expect(del(reciente, 'ESCALADO_INFRA')[0].texto).toBe('INC-00215 fue escalado a Infraestructura (Edson)')

    const viejo = buildAlertas([incidente({ escalado_infra_id: 'u1', hora_escalado_infra: haceMin(48 * 60) })], [], {}, AHORA)
    expect(del(viejo, 'ESCALADO_INFRA')).toHaveLength(0)
  })

  it('incidente reabierto: usa hora_registro, que reabrir reinicia', () => {
    const as = buildAlertas([incidente({ motivo_reabertura: 'TIENDA_SIN_INTERNET', hora_registro: haceMin(20) })], [], {}, AHORA)
    expect(del(as, 'REABIERTO')[0].texto).toBe('INC-00215 fue reabierto — la tienda sigue sin internet')
  })
})

describe('alerta 6 — sin descartes después de 30 min', () => {
  it('dispara con los cuatro descartes en null', () => {
    const as = buildAlertas([incidente({
      hora_registro: haceMin(45),
      desc_energia: null, desc_router: null, desc_cableado: null, desc_reinicio_equipo: null,
    })], [], {}, AHORA)
    expect(del(as, 'SIN_DESCARTES')).toHaveLength(1)
  })

  it('un descarte en false ya es diagnóstico hecho: no dispara', () => {
    const as = buildAlertas([incidente({
      hora_registro: haceMin(45),
      desc_energia: false, desc_router: null, desc_cableado: null, desc_reinicio_equipo: null,
    })], [], {}, AHORA)
    expect(del(as, 'SIN_DESCARTES')).toHaveLength(0)
  })

  it('antes de los 30 min no dispara', () => {
    const as = buildAlertas([incidente({
      hora_registro: haceMin(20),
      desc_energia: null, desc_router: null, desc_cableado: null, desc_reinicio_equipo: null,
    })], [], {}, AHORA)
    expect(del(as, 'SIN_DESCARTES')).toHaveLength(0)
  })
})

describe('alerta 7 — tienda sin router de contingencia', () => {
  const desprotegida = { tienda_tiene_contingencia: false, tienda_tiene_router_externo: false, cont_activado_por: null }

  it('dispara y linkea a la tienda, no al incidente', () => {
    const a = del(buildAlertas([incidente(desprotegida)], [], {}, AHORA), 'SIN_ROUTER_CONTINGENCIA')[0]
    expect(a.texto).toContain('T20')
    expect(a.href).toBe('/tiendas/tid-1')
  })

  it('en CORTE_ELECTRICO no dispara: un router no resuelve un corte de luz', () => {
    const as = buildAlertas([incidente({ ...desprotegida, tipo: 'CORTE_ELECTRICO' })], [], {}, AHORA)
    expect(del(as, 'SIN_ROUTER_CONTINGENCIA')).toHaveLength(0)
  })

  it('si hay un router externo parado en la tienda, no hay nada que coordinar', () => {
    const as = buildAlertas([incidente({ ...desprotegida, tienda_tiene_router_externo: true })], [], {}, AHORA)
    expect(del(as, 'SIN_ROUTER_CONTINGENCIA')).toHaveLength(0)
  })
})

describe('alerta 10 — proveedor con varios incidentes activos', () => {
  it('con 3 dispara; con 2 no', () => {
    const tres = [1, 2, 3].map(n => incidente({ id: `i${n}`, codigo: `INC-0000${n}` }))
    expect(del(buildAlertas(tres, [], {}, AHORA), 'PROVEEDOR_MULTIPLE')[0].texto)
      .toBe('CLARO tiene 3 incidentes activos a la vez — posible falla sistémica')

    const dos = tres.slice(0, 2)
    expect(del(buildAlertas(dos, [], {}, AHORA), 'PROVEEDOR_MULTIPLE')).toHaveLength(0)
  })

  it('con 5 o más sube a rojo', () => {
    const cinco = [1, 2, 3, 4, 5].map(n => incidente({ id: `i${n}` }))
    expect(del(buildAlertas(cinco, [], {}, AHORA), 'PROVEEDOR_MULTIPLE')[0].severidad).toBe('ROJO')
  })
})

describe('alerta 13 — proveedor sin responder', () => {
  it('se mide desde el envío del correo, no desde hora_registro', () => {
    // 10h de incidente pero recién escalado hace 1h: todavía no corresponde.
    const reciente = buildAlertas([incidente({ hora_registro: haceMin(600), esperando_proveedor_desde: haceMin(60) })], [], {}, AHORA)
    expect(del(reciente, 'PROVEEDOR_SIN_RESPUESTA')).toHaveLength(0)

    const viejo = buildAlertas([incidente({ hora_registro: haceMin(600), esperando_proveedor_desde: haceMin(280) })], [], {}, AHORA)
    expect(del(viejo, 'PROVEEDOR_SIN_RESPUESTA')[0].texto).toBe('CLARO no responde INC-00215 hace 4h 40min')
  })
})

describe('alertas 8, 9 y 11 — gestión, contratos y datos', () => {
  it('evaluación vencida hace más de 15 días sube a rojo', () => {
    const data = { evaluacionesPendientes: [
      { id: 'ac-1', codigo: 'AC-001', ventana: 30, fecha: '2026-09-08' },
      { id: 'ac-2', codigo: 'AC-002', ventana: 90, fecha: '2026-07-01' },
    ] }
    const as = del(buildAlertas([], [], data, AHORA), 'EVAL_PENDIENTE')
    expect(as.find(a => a.texto.startsWith('AC-001'))!.severidad).toBe('AMARILLO')
    expect(as.find(a => a.texto.startsWith('AC-002'))!.severidad).toBe('ROJO')
    expect(as[0].href).toMatch(/^\/gestion-cambios\//)
  })

  it('contrato por vencer: una sola alerta por ficha, en el umbral que le toca', () => {
    const data = { contratosPorVencer: [
      { ficha_id: 'f1', tienda_codigo: 'T20', dias_restantes: 5,  renovacion_automatica: false },
      { ficha_id: 'f2', tienda_codigo: 'T21', dias_restantes: 25, renovacion_automatica: false },
      { ficha_id: 'f3', tienda_codigo: 'T22', dias_restantes: 45, renovacion_automatica: false },
    ] }
    const as = del(buildAlertas([], [], data, AHORA), 'CONTRATO_POR_VENCER')
    expect(as).toHaveLength(3)
    expect(as.find(a => a.texto.startsWith('T20'))!.severidad).toBe('ROJO')      // <= 7d
    expect(as.find(a => a.texto.startsWith('T21'))!.severidad).toBe('AMARILLO')  // <= 30d
    expect(as.find(a => a.texto.startsWith('T22'))!.severidad).toBe('INFO')      // <= 60d
  })

  it('un contrato con renovación automática queda en informativo', () => {
    const data = { contratosPorVencer: [{ ficha_id: 'f1', tienda_codigo: 'T20', dias_restantes: 5, renovacion_automatica: true }] }
    expect(del(buildAlertas([], [], data, AHORA), 'CONTRATO_POR_VENCER')[0].severidad).toBe('INFO')
  })

  it('tiendas sin venta va agrupada en una sola línea', () => {
    const as = del(buildAlertas([], [], { tiendasSinVenta: 34 }, AHORA), 'TIENDAS_SIN_VENTA')
    expect(as).toHaveLength(1)
    expect(as[0].texto).toContain('34 tiendas sin venta configurada')
  })

  it('sin tiendas pendientes no hay línea', () => {
    expect(buildAlertas([], [], { tiendasSinVenta: 0 }, AHORA)).toEqual([])
  })
})

describe('alerta 12 — agente sobrecargado', () => {
  it('dispara a partir de 4 casos activos', () => {
    const equipo = [{ id: 'u1', nombre: 'Ana', casosActivos: 4 }, { id: 'u2', nombre: 'Luis', casosActivos: 3 }]
    const as = del(buildAlertas([], equipo, {}, AHORA), 'AGENTE_SOBRECARGADO')
    expect(as).toHaveLength(1)
    expect(as[0].texto).toBe('Ana tiene 4 casos activos')
    expect(as[0].agenteId).toBe('u1')
  })
})

describe('orden y unicidad', () => {
  it('las alertas salen ordenadas por severidad, rojo primero', () => {
    const as = buildAlertas(
      [incidente({ hora_registro: haceMin(30 * 60), sinMitigacionDesde: haceMin(90) })],
      [{ id: 'u1', nombre: 'Ana', casosActivos: 5 }],
      { tiendasSinVenta: 3 },
      AHORA,
    )
    const orden = { ROJO: 0, NARANJA: 1, AMARILLO: 2, INFO: 3 } as const
    const vals = as.map(a => orden[a.severidad])
    expect(vals).toEqual([...vals].sort((x, y) => x - y))
  })

  it('cada alerta tiene un id único — sirve de key en React', () => {
    const as = buildAlertas(
      [incidente({ id: 'a', hora_registro: haceMin(30 * 60), sinMitigacionDesde: haceMin(90) }),
       incidente({ id: 'b', hora_registro: haceMin(30 * 60), sinMitigacionDesde: haceMin(90) })],
      [], {}, AHORA,
    )
    expect(new Set(as.map(a => a.id)).size).toBe(as.length)
  })
})

describe('fmtDuracion', () => {
  it('formatea minutos, horas y horas exactas', () => {
    expect(fmtDuracion(45)).toBe('45min')
    expect(fmtDuracion(83)).toBe('1h 23min')
    expect(fmtDuracion(120)).toBe('2h')
  })
})

describe('notaContratos', () => {
  it('avisa cuando ninguna ficha activa tiene fecha de fin (caso real de producción)', () => {
    expect(notaContratos({ fichasActivas: 159, conFechaFin: 0 }))
      .toContain('ninguna de las 159 fichas activas tiene fecha de fin')
  })

  it('con datos cargados no muestra nota', () => {
    expect(notaContratos({ fichasActivas: 159, conFechaFin: 12 })).toBeNull()
  })
})
