/**
 * Seed realista de netdesk_test — ~3 meses de operación simulada de Footloose Perú.
 *
 * Borra TODA la data de netdesk_test (TRUNCATE ... CASCADE) y la reemplaza por un
 * dataset coherente: usuarios, proveedores con niveles, 150 tiendas con su ficha,
 * 300 incidentes con tramos de mitigación, escalamientos, llamadas ATC, alertas
 * SLA, routers de contingencia y acciones de gestión de cambios.
 *
 * Reglas que respeta (ver CLAUDE.md):
 *   - Timestamps en UTC naive. Las horas "realistas" (8am–10pm) son hora Lima.
 *   - IEI: cada tramo cerrado lleva ie_tramo = calcIeTramo(); tramos sin huecos.
 *   - Formatos idénticos a los que escribe la app (código de incidente con la
 *     secuencia netdesk_inc_seq, FC-NNN-Tnn, AC-NNN, RE-NNN, GM-NNNNN, etc.).
 *
 * El fixture base de los tests (tests/fixtures/seed-test-data.ts: TST-P1-001,
 * T-TEST01, BITEL TEST, agente-test) se copia antes del TRUNCATE y se reinserta
 * tal cual, en la MISMA transacción: si algo falla, la BD queda como estaba.
 *
 * Fase 2 (después del commit): snapshots y evaluación a 30 días de gestión de
 * cambios con calcMetrics — la misma función que usa la app.
 *
 * Uso:  npx tsx scripts/seed-realista.ts
 * Solo corre contra netdesk_test en localhost (ver seed-realista/env.ts).
 */
import './seed-realista/env'
import { randomUUID } from 'crypto'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql, eq } from 'drizzle-orm'
import * as S from '../drizzle/schema'
import { LIMA, PROVINCIAS, SUPERVISORES_ZONALES, zonaDe, type LocalCatalogo } from './seed-realista/catalogo'
import * as TX from './seed-realista/textos'
import { calcIeTramo, calcIeiIncidente, factorBaseSinMitigacion, normFactorMitigacion, type TipoMitigacionTramo } from '../lib/mitigacion-tramos'
import { calcImpactoRow } from '../lib/impacto-calc'
import { buildCorreo } from '../components/incidentes/helpers'

// ═══ Azar determinista ═══════════════════════════════════════════════════════
// SEED_RNG elige la semilla; con SEED_DRY=1 solo simula e imprime las métricas
// (sirve para elegir la semilla cuyo resultado se acerca más al spec).
const SEMILLA = Number(process.env.SEED_RNG ?? 3)
let _s = SEMILLA
function rnd(): number {
  _s = (_s + 0x6D2B79F5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const ru = (a: number, b: number) => a + rnd() * (b - a)
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]
const chance = (p: number) => rnd() < p
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
function gauss(): number {
  let u = 0, v = 0
  while (!u) u = rnd()
  while (!v) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const logn = (mediana: number, sigma: number) => mediana * Math.exp(sigma * gauss())
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
function pesado<T>(pares: [T, number][]): T {
  const total = pares.reduce((s, [, w]) => s + w, 0)
  let x = rnd() * total
  for (const [v, w] of pares) { x -= w; if (x <= 0) return v }
  return pares[pares.length - 1][0]
}
const digitos = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? ri(1, 9) : ri(0, 9))).join('')
const celular = () => '9' + digitos(8).slice(0, 8)

// ═══ Tiempo (Lima = UTC−5, sin horario de verano) ════════════════════════════
const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000
const AHORA = new Date(Math.floor((process.env.SEED_AHORA ? Date.parse(process.env.SEED_AHORA) : Date.now()) / MIN) * MIN)
const addMin = (d: Date, m: number) => new Date(d.getTime() + Math.round(m * MIN))
const conSeg = (d: Date) => new Date(d.getTime() + ri(0, 59) * 1000)
const minEntre = (a: Date, b: Date) => (b.getTime() - a.getTime()) / MIN
function lima(d: Date) {
  const l = new Date(d.getTime() - 5 * HORA)
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), h: l.getUTCHours(), dow: l.getUTCDay() }
}
/** Instante UTC de una hora de pared en Lima. */
const desdeLima = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, m, d, h + 5, mi))
/** Medianoche Lima de hace `n` días. */
function diaLima(nAtras: number): Date {
  const h = lima(AHORA)
  return desdeLima(h.y, h.m, h.d - nAtras)
}
const fechaLima = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const REDISENO_DESCARTES = new Date('2026-09-10T12:42:07Z') // commit 2d2fa42

// ═══ Catálogos fijos ═════════════════════════════════════════════════════════
type Prov = 'CLARO' | 'BITEL' | 'ENTEL' | 'MOVISTAR' | 'CONVERGIA'
const PROVS: Record<Prov, {
  slaResp: number; slaResol: number; respMed: number; respSig: number; respMin: number; respMax: number
  rep: number; fragil: number; prefijo: string; ticket: () => string; horario: string
}> = {
  CLARO:     { slaResp: 240, slaResol: 480,  respMed: 150, respSig: 0.75, respMin: 25, respMax: 720,  rep: 1.0, fragil: 1.0, prefijo: 'CLR', ticket: () => `TK-${digitos(7)}`,  horario: '24x7' },
  BITEL:     { slaResp: 360, slaResol: 720,  respMed: 265, respSig: 0.70, respMin: 30, respMax: 900,  rep: 1.3, fragil: 1.3, prefijo: 'BTL', ticket: () => `BT${digitos(8)}`,   horario: 'L-D 07:00-23:00' },
  ENTEL:     { slaResp: 240, slaResol: 360,  respMed: 95,  respSig: 0.70, respMin: 15, respMax: 600,  rep: 0.8, fragil: 0.8, prefijo: 'ENT', ticket: () => `ENT-${digitos(6)}`, horario: '24x7' },
  MOVISTAR:  { slaResp: 180, slaResol: 360,  respMed: 160, respSig: 0.70, respMin: 20, respMax: 720,  rep: 1.1, fragil: 1.0, prefijo: 'MOV', ticket: () => `MOV${digitos(7)}`,  horario: '24x7' },
  CONVERGIA: { slaResp: 480, slaResol: 1440, respMed: 440, respSig: 0.70, respMin: 45, respMax: 1200, rep: 1.8, fragil: 1.6, prefijo: 'CVG', ticket: () => `CVG-${digitos(5)}`, horario: 'L-S 08:00-20:00' },
}

const PROV_DATOS: Record<Prov, { correo: string; telefono: string; plan: string; canal: string; instruccion: string; obs: string
  niveles: { nombre: string; email: string; celular: string; canal: string; horario: string; sev: [string, string, string]; esperado: number; instruccion: string }[] }> = {
  CLARO: {
    correo: 'noc.empresas@claro.com.pe', telefono: '0800-00-123', plan: 'Internet Dedicado Empresas', canal: 'Correo NOC 24x7 + línea 0800',
    instruccion: 'Enviar correo al NOC Empresas con CID, dirección y descartes. En caídas totales llamar además al 0800-00-123 y anotar el ticket.',
    obs: 'WhatsApp NOC: +51 997 553 120. Visitas técnicas en Lima en menos de 4 h.',
    niveles: [
      { nombre: 'NOC Claro Empresas', email: 'noc.empresas@claro.com.pe', celular: '997553120', canal: 'correo', horario: '24x7', sev: ['30', '60', '120'], esperado: 240, instruccion: 'Adjuntar foto de las luces del ONT.' },
      { nombre: 'Luis Fernández Rojas', email: 'lfernandezr@claro.com.pe', celular: '987114502', canal: 'whatsapp', horario: 'L-S 08:00-20:00', sev: ['60', '120', '240'], esperado: 180, instruccion: 'Escalar si el NOC no responde en 2 h.' },
      { nombre: 'Carla Medina Quiroz', email: 'cmedina.kam@claro.com.pe', celular: '989330471', canal: 'telefono', horario: 'L-V 09:00-18:00', sev: ['120', '240', '480'], esperado: 120, instruccion: 'Key Account Manager: solo caídas de más de 6 h o masivas.' },
    ],
  },
  BITEL: {
    correo: 'soporte.corporativo@bitel.com.pe', telefono: '0800-79-123', plan: 'Bitel Empresas Fibra', canal: 'Correo + WhatsApp corporativo',
    instruccion: 'Reportar por correo a Soporte Corporativo. Bitel pide el CID y el nombre del administrador de tienda.',
    obs: 'WhatsApp corporativo: +51 930 120 450. Cobertura técnica fuerte en provincias.',
    niveles: [
      { nombre: 'Soporte Corporativo Bitel', email: 'soporte.corporativo@bitel.com.pe', celular: '930120450', canal: 'correo', horario: 'L-D 07:00-23:00', sev: ['60', '120', '240'], esperado: 360, instruccion: 'Indicar CID y contacto en tienda.' },
      { nombre: 'Ricardo Huamaní Torres', email: 'rhuamani@bitel.com.pe', celular: '930448127', canal: 'whatsapp', horario: 'L-S 08:00-20:00', sev: ['120', '240', '360'], esperado: 240, instruccion: 'Supervisor de soporte. Escalar a las 3 h sin respuesta.' },
      { nombre: 'Mónica Vela Gutiérrez', email: 'mvela@bitel.com.pe', celular: '930775301', canal: 'telefono', horario: 'L-V 09:00-18:00', sev: ['240', '480', '720'], esperado: 180, instruccion: 'Jefa de cuentas corporativas.' },
    ],
  },
  ENTEL: {
    correo: 'noc.corporativo@entel.pe', telefono: '0800-11-000', plan: 'Entel Fibra Empresas', canal: 'Correo NOC 24x7',
    instruccion: 'Correo al NOC corporativo con CID. Entel responde con un número ENT-xxxxxx.',
    obs: 'Portal de tickets disponible para seguimiento. WhatsApp NOC: +51 940 300 300.',
    niveles: [
      { nombre: 'NOC Entel Empresas', email: 'noc.corporativo@entel.pe', celular: '940300300', canal: 'correo', horario: '24x7', sev: ['30', '60', '120'], esperado: 180, instruccion: 'Incluir pruebas de ping y tracert.' },
      { nombre: 'Andrés Palomino Ruiz', email: 'apalomino@entel.pe', celular: '940512688', canal: 'whatsapp', horario: 'L-S 07:00-22:00', sev: ['60', '120', '240'], esperado: 120, instruccion: 'Supervisor NOC.' },
      { nombre: 'Silvia Quintana Lara', email: 'squintana@entel.pe', celular: '940661204', canal: 'telefono', horario: 'L-V 09:00-18:00', sev: ['120', '240', '360'], esperado: 120, instruccion: 'Gerente de cuenta.' },
    ],
  },
  MOVISTAR: {
    correo: 'soporte.negocios@movistar.com.pe', telefono: '0800-11-800', plan: 'Movistar Negocios Fibra', canal: 'Correo + línea 0800',
    instruccion: 'Correo a Soporte Negocios y llamada al 0800-11-800 para obtener el ticket.',
    obs: 'Atención 24x7. Las visitas en provincia pueden tardar más de 24 h.',
    niveles: [
      { nombre: 'Centro de Gestión Movistar Empresas', email: 'soporte.negocios@movistar.com.pe', celular: '980100800', canal: 'correo', horario: '24x7', sev: ['30', '90', '180'], esperado: 240, instruccion: 'Pedir número de ticket por teléfono.' },
      { nombre: 'Enrique Saldaña Ponce', email: 'enrique.saldana@movistar.com.pe', celular: '980214337', canal: 'whatsapp', horario: 'L-S 08:00-20:00', sev: ['60', '120', '240'], esperado: 180, instruccion: 'Supervisor de atención empresarial.' },
      { nombre: 'Lorena Bustamante Díaz', email: 'lorena.bustamante@movistar.com.pe', celular: '980395166', canal: 'telefono', horario: 'L-V 09:00-18:00', sev: ['120', '240', '480'], esperado: 120, instruccion: 'Ejecutiva de cuenta.' },
    ],
  },
  CONVERGIA: {
    correo: 'soporte@convergia.com.pe', telefono: '(01) 700-5000', plan: 'Convergia Internet Corporativo', canal: 'Correo en horario de oficina',
    instruccion: 'Correo a soporte. Fuera de horario solo atienden por el teléfono de guardia.',
    obs: 'Guardia fuera de horario: +51 951 008 870. Respuesta lenta; escalar a N2 pronto.',
    niveles: [
      { nombre: 'Soporte Técnico Convergia', email: 'soporte@convergia.com.pe', celular: '951008870', canal: 'correo', horario: 'L-S 08:00-20:00', sev: ['120', '240', '480'], esperado: 480, instruccion: 'Incluir CID y horario de la tienda.' },
      { nombre: 'Gustavo Reátegui Mori', email: 'greategui@convergia.com.pe', celular: '951224510', canal: 'telefono', horario: 'L-V 08:00-18:00', sev: ['240', '480', '720'], esperado: 360, instruccion: 'Coordinador de soporte.' },
      { nombre: 'Elena Chávez Ugarte', email: 'echavez@convergia.com.pe', celular: '951339082', canal: 'correo', horario: 'L-V 09:00-18:00', sev: ['480', '720', '1440'], esperado: 240, instruccion: 'Gerente comercial.' },
    ],
  },
}

const TIPOS = ['CAIDA_TOTAL', 'INTERMITENCIA', 'CORTE_ELECTRICO', 'LENTITUD', 'OTROS'] as const
type Tipo = typeof TIPOS[number]
const P_ESCALA: Record<Tipo, number> = { CAIDA_TOTAL: 0.70, INTERMITENCIA: 0.64, LENTITUD: 0.55, OTROS: 0.30, CORTE_ELECTRICO: 0 }
const REPARACION: Record<Tipo, number> = { CAIDA_TOTAL: 70, INTERMITENCIA: 150, LENTITUD: 190, OTROS: 90, CORTE_ELECTRICO: 60 }
const DUR_SIN_ESCALAR: Record<Tipo, number> = { CAIDA_TOTAL: 55, INTERMITENCIA: 120, LENTITUD: 150, OTROS: 80, CORTE_ELECTRICO: 80 }

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// ═══ Tipos internos ══════════════════════════════════════════════════════════
type Row = Record<string, any>
interface TiendaGen extends Row {
  id: string; codigo: string; loc: LocalCatalogo; zona: string; nueva: boolean
  historiaProv: { desde: Date; prov: Prov; fichaId: string }[]  // ordenado por fecha
  intervalos: [number, number][]
}
type EstadoPlan = 'RESUELTO' | 'REABIERTO' | 'CERRADO' | 'ACTIVO' | 'CANCELADO'
type Mit = 'NINGUNA' | 'ROUTER_PROPIO' | 'ROUTER_EXTERNO' | 'DATOS_MOVILES' | 'BOLETA_MANUAL' | 'MULTI'
interface Plan {
  estado: EstadoPlan; tipo: Tipo; grupo: number | null; mit: Mit
  multi?: [TipoMitigacionTramo, TipoMitigacionTramo]
  router?: string // código RE-xxx para ROUTER_EXTERNO
  dias?: [number, number] // ventana fija de registro (días atrás), para la historia de los routers
}

async function main() {
  const url = process.env.DATABASE_URL!
  const client = postgres(url, { max: 1, connection: { TimeZone: 'UTC' }, onnotice: () => {} })
  const db = drizzle(client, { schema: S })
  const log = (...a: any[]) => console.log('·', ...a)
  log(`AHORA = ${AHORA.toISOString()} (Lima ${AHORA.toLocaleString('es-PE', { timeZone: 'America/Lima' })})`)

  // ═══ Usuarios ══════════════════════════════════════════════════════════════
  const hash = await bcrypt.hash('Demo2026', 12)
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const mkUser = (nombre: string, apellido: string, rol: any, email?: string): Row => ({
    id: randomUUID(), nombre, apellido, rol, email: email ?? `${slug(nombre)}.${slug(apellido)}@footloose.pe`,
    celular: celular(), password: hash, debeCambiarPassword: false, activo: true,
    creadoEn: conSeg(addMin(diaLima(ri(150, 210)), ri(9 * 60, 17 * 60))),
  })
  const agentes = [['Carlos', 'Mendoza'], ['Lucía', 'Paredes'], ['Jorge', 'Quispe'], ['Rosa', 'Huamán'], ['Miguel', 'Torres']]
    .map(([n, a]) => mkUser(n, a, 'AGENTE'))
  const supervisores = [['Patricia', 'Salazar'], ['Ricardo', 'Vásquez']].map(([n, a]) => mkUser(n, a, 'SUPERVISOR'))
  const infras = [['Fernando', 'Castillo'], ['Diana', 'Rojas']].map(([n, a]) => mkUser(n, a, 'INFRAESTRUCTURA'))
  const demo = mkUser('Pruebas', 'Ediciones', 'DEMO', 'pruebas.ediciones@pruebas.com')
  const usuarios = [...agentes, ...supervisores, ...infras, demo]

  // ═══ Proveedores y sus niveles por defecto ═════════════════════════════════
  const provId = {} as Record<Prov, string>
  const proveedores: Row[] = []
  const provNiveles: Row[] = []
  for (const p of Object.keys(PROVS) as Prov[]) {
    const d = PROV_DATOS[p]
    provId[p] = randomUUID()
    const creado = conSeg(addMin(diaLima(ri(400, 700)), 10 * 60))
    proveedores.push({
      id: provId[p], nombre: p, correoSoporte: d.correo, telefonoSoporte: d.telefono, instruccionGeneral: d.instruccion,
      planPrincipal: d.plan, canalAtencion: d.canal, observaciones: d.obs, creadoEn: creado,
    })
    d.niveles.forEach((n, i) => provNiveles.push({
      id: randomUUID(), proveedorId: provId[p], nivel: i + 1, nombreContacto: n.nombre, email: n.email, celular: n.celular,
      tiempoRespSev1: n.sev[0], tiempoRespSev2: n.sev[1], tiempoRespSev3: n.sev[2],
      correosCopia: i === 0 ? null : [d.niveles[0].email], whatsapp: n.canal === 'whatsapp' || i === 0 ? `+51 ${n.celular.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : null,
      canal: n.canal, horarioAtencion: n.horario, tiempoEsperadoSolucion: n.esperado, instruccion: n.instruccion, activo: true,
      creadoEn: creado,
    }))
  }

  // ═══ Tiendas ═══════════════════════════════════════════════════════════════
  const codigos = [
    ...Array.from({ length: 99 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`),
    ...['A', 'B', 'C', 'D'].flatMap(l => Array.from({ length: 9 }, (_, i) => `T${l}${i + 1}`)),
    ...Array.from({ length: 9 }, (_, i) => `TE${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `TF${i + 1}`),
  ]
  const locales = shuffle([...LIMA, ...PROVINCIAS])
  const esLima = (l: LocalCatalogo) => LIMA.includes(l)
  // Proveedor por zona: Convergia solo en Lima; Bitel fuerte en provincia.
  const cupoProv: Record<Prov, { lima: number; prov: number }> = {
    CLARO: { lima: 35, prov: 15 }, BITEL: { lima: 15, prov: 25 }, ENTEL: { lima: 18, prov: 12 },
    MOVISTAR: { lima: 12, prov: 8 }, CONVERGIA: { lima: 10, prov: 0 },
  }
  const bolsaLima = shuffle((Object.keys(cupoProv) as Prov[]).flatMap(p => Array(cupoProv[p].lima).fill(p)))
  const bolsaProv = shuffle((Object.keys(cupoProv) as Prov[]).flatMap(p => Array(cupoProv[p].prov).fill(p)))
  const PREMIUM = /Jockey|Larcomar|Plaza Norte|MegaPlaza Independencia|Mall del Sur|Salaverry|Real Plaza Arequipa|Mall Plaza Trujillo/

  const tiendas: TiendaGen[] = locales.map((loc, i) => {
    const nueva = i >= 120
    const prov: Prov = esLima(loc) ? bolsaLima.pop()! : bolsaProv.pop()!
    const zona = zonaDe(loc)
    let venta: number | null = null, propFds: number | null = null, cluster: string
    if (!nueva) {
      const base = loc.formato === 'MALL' ? 230_000 : loc.formato === 'PUERTA CALLE' ? 165_000 : 140_000
      venta = Math.round(clamp(logn(base * (PREMIUM.test(loc.nombreCc) ? 1.45 : 1), 0.42), 80_000, 500_000) / 10) * 10
      propFds = Math.round((loc.formato === 'MALL' ? ru(0.50, 0.62) : ru(0.42, 0.53)) * 100) / 100
      cluster = venta >= 330_000 ? 'A' : venta >= 210_000 ? 'B' : venta >= 130_000 ? 'C' : 'D'
    } else {
      cluster = pesado([['B', 2], ['C', 4.5], ['D', 3.5]])
    }
    // Fórmula de app/api/tiendas/[id]/route.ts (L-J = 4d×12h, V-D = 3d×12h).
    const semanal = venta != null ? venta * 7 / 30.44 : null
    const tieneCont = chance(0.7)
    const sup = SUPERVISORES_ZONALES[zona]
    const tienda: TiendaGen = {
      id: randomUUID(), codigo: '', loc, zona, nueva, historiaProv: [], intervalos: [],
      nombreCc: loc.formato === 'PUERTA CALLE' ? 'Puerta Calle' : loc.nombreCc,
      formato: pesado([['FOOTLOOSE', 75], ['R18', 15], ['FOOTLOOSE SPORT', 10]]),
      direccion: loc.direccion + (loc.formato === 'MALL' ? `, Local ${loc.direccion.includes('Nivel 2') ? 2 : 1}${digitos(2)}` : ''),
      referencia: loc.formato === 'PUERTA CALLE' ? loc.nombreCc.replace('Puerta Calle ', '') : null,
      distrito: loc.distrito, provincia: loc.provincia,
      ubicacion: loc.formato === 'MALL' ? (loc.direccion.includes('Nivel 2') ? 'Nivel 2' : 'Nivel 1') : null,
      coordenadas: loc.coordenadas, cluster,
      supervisorNombre: sup.nombre, supervisorCelular: sup.celular,
      perfilSupervisor: null, prov,
      tieneContingencia: tieneCont,
      contingenciaChip: tieneCont ? `${celular().replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : null,
      contingenciaPaquete: tieneCont ? pick(['40 GB', '60 GB', '80 GB']) : null,
      contingenciaDescripcion: tieneCont ? pick(['Router 4G TP-Link MR600 en gabinete', 'Router 4G Huawei B311 en caja', 'Router 4G ZTE MF286 en almacén de tienda']) : null,
      administradorNombre: `${pick(TX.NOMBRES)} ${pick(TX.APELLIDOS)}`,
      administradorCelular: celular(), celularTienda: celular(),
      anydeskId: `${digitos(3)} ${digitos(3).replace(/^./, String(ri(0, 9)))} ${digitos(3).replace(/^./, String(ri(0, 9)))}`,
      gabinete: chance(0.6),
      instruccionReporte: chance(0.3) ? pick([
        'Llamar al administrador antes de escalar al proveedor.',
        'El router está en el almacén del fondo; pedir que lo revise el cajero principal.',
        'La tienda cierra a las 22:00; fuera de horario coordinar con seguridad del mall.',
      ]) : null,
      contactoSoporte: chance(0.4) ? 'Administrador de tienda' : null,
      ventaMensualSoles: venta != null ? venta.toFixed(2) : null,
      proporcionFds: propFds != null ? propFds.toFixed(2) : null,
      ventaHoraSoles: semanal != null ? ((semanal * (1 - propFds!)) / 48).toFixed(2) : null,
      ventaHoraFdsSoles: semanal != null ? ((semanal * propFds!) / 36).toFixed(2) : null,
      observacion: chance(0.08) ? pick(['Local en remodelación parcial hasta fin de mes.', 'Comparte gabinete de red con el mall.', 'Señal 4G débil dentro del local.']) : null,
      tipoLocal: 'TIENDA', estado: 'ACTIVA', contingenciaActiva: false,
    }
    return tienda
  })
  // Códigos y antigüedad: las 120 con venta son las antiguas (códigos bajos).
  tiendas.forEach((t, i) => {
    t.codigo = codigos[i]
    t.administradorEmail = `tienda.${t.codigo.toLowerCase()}@footloose.pe`
    t.creadoEn = t.nueva
      ? conSeg(addMin(diaLima(160 - Math.round((i - 120) * 2)), ri(9 * 60, 18 * 60)))
      : conSeg(addMin(diaLima(1400 - i * 9), ri(9 * 60, 18 * 60)))
  })
  log(`tiendas: ${tiendas.length} (Lima ${tiendas.filter(t => esLima(t.loc)).length}, con venta ${tiendas.filter(t => !t.nueva).length})`)

  // ═══ Fichas iniciales (1 ACTIVA por tienda) ════════════════════════════════
  const fichas: Row[] = []
  const fichaNiveles: Row[] = []
  const nivelesDeFicha = new Map<string, Row[]>()
  const conexiones = shuffle([...Array(105).fill('FIBRA OPTICA'), ...Array(22).fill('HFC'), ...Array(15).fill('FTTH'), ...Array(8).fill('WIRELESS')])
  const VEL: [string, number, number][] = [['20', 150, 260], ['50', 230, 380], ['100', 350, 560], ['200', 520, 800]]
  function nuevaFicha(t: TiendaGen, prov: Prov, opts: { estado: string; creado: Date; activado: Date | null; archivado?: Date | null; conexion?: string; mejor?: boolean }): Row {
    const [vel, cMin, cMax] = opts.mejor ? pick(VEL.slice(2)) : pesado<[string, number, number]>([[VEL[0], 1], [VEL[1], 3], [VEL[2], 4], [VEL[3], 1.5]])
    const inicio = opts.activado ?? opts.creado
    const conFin = chance(0.3)
    const meses = pick([12, 24, 36])
    const fin = new Date(inicio.getTime()); fin.setUTCMonth(fin.getUTCMonth() + meses)
    const plan = `${PROV_DATOS[prov].plan} ${vel} Mbps`
    const f: Row = {
      id: randomUUID(), codigo: '', tiendaId: t.id, proveedorId: provId[prov], estado: opts.estado,
      codigoContrato: `${PROVS[prov].prefijo}-${lima(inicio).y}-${digitos(5)}`,
      plan, tipoServicio: pick(['Internet dedicado', 'Internet dedicado', 'Internet empresarial']),
      velocidadCapacidad: `${vel} Mbps`, costoMensual: ri(cMin, cMax).toFixed(2),
      fechaInicio: fechaLima(inicio), fechaFin: conFin ? fechaLima(fin) : null,
      renovacionAutomatica: !conFin && chance(0.5),
      penalidad: pick(['Descuento de 1/30 del cargo mensual por cada 4 h de indisponibilidad.', 'Nota de crédito proporcional al tiempo fuera de servicio.', 'Penalidad del 5% del cargo mensual si se incumple el SLA de resolución.']),
      slaComprometido: pick(['Disponibilidad 99.5% mensual', 'Disponibilidad 99.0% mensual', 'Disponibilidad 99.7% mensual']),
      tiempoRespuestaSla: PROVS[prov].slaResp, tiempoResolucionSla: PROVS[prov].slaResol,
      horarioAtencionSla: PROVS[prov].horario,
      tipoConexion: opts.conexion ?? 'FIBRA OPTICA', cidServicio: digitos(ri(4, 6)), velocidad: `${vel}Mb`,
      planAplicado: plan, vigenciaContrato: conFin ? `${meses} meses` : 'Indefinido', estadoServicio: 'ACTIVO',
      fechaAltaServicio: fechaLima(inicio),
      descripcionServicio: 'Enlace principal de datos e internet para cajas, POS y sistemas de tienda.',
      creadoPorId: pick(supervisores).id, activadoEn: opts.activado, archivadoEn: opts.archivado ?? null, creadoEn: opts.creado,
    }
    fichas.push(f)
    const niv = provNiveles.filter(n => n.proveedorId === provId[prov]).map(n => ({
      ...n, id: randomUUID(), fichaId: f.id, proveedorId: undefined, personalizado: false, creadoEn: opts.creado,
    }))
    niv.forEach(n => { delete (n as any).proveedorId })
    fichaNiveles.push(...niv)
    nivelesDeFicha.set(f.id, niv)
    return f
  }
  for (const t of tiendas) {
    const creado = addMin(t.creadoEn, -ri(3, 10) * 24 * 60)
    const f = nuevaFicha(t, t.prov, { estado: 'ACTIVA', creado, activado: addMin(creado, ri(60, 2 * 24 * 60)), conexion: conexiones.pop() })
    t.historiaProv.push({ desde: new Date(0), prov: t.prov, fichaId: f.id })
  }

  // ═══ Gestión de cambios EJECUTADAS (se deciden antes que los incidentes) ═══
  const conVenta = (p: Prov, lima: boolean) => tiendas.filter(t => !t.nueva && t.prov === p && esLima(t.loc) === lima && t.tieneContingencia)
  interface AccEjec { tipo: string; tienda: TiendaGen; provAnt: Prov; provNvo: Prov; creado: number; aprob: number; ejec: number; eval: number }
  const ejecutadas: AccEjec[] = [
    { tipo: 'CAMBIO_CONTRATO',     tienda: pick(conVenta('CLARO', true)),    provAnt: 'BITEL',     provNvo: 'CLARO',    creado: 55, aprob: 51, ejec: 45, eval: 13 },
    { tipo: 'CAMBIO_CONTRATO',     tienda: pick(conVenta('ENTEL', true)),    provAnt: 'CONVERGIA', provNvo: 'ENTEL',    creado: 61, aprob: 57, ejec: 50, eval: 18 },
    { tipo: 'RENOVACION_CONTRATO', tienda: pick(conVenta('MOVISTAR', true)), provAnt: 'MOVISTAR',  provNvo: 'MOVISTAR', creado: 52, aprob: 49, ejec: 42, eval: 10 },
    { tipo: 'RENOVACION_CONTRATO', tienda: pick(conVenta('ENTEL', false)),   provAnt: 'ENTEL',     provNvo: 'ENTEL',    creado: 58, aprob: 55, ejec: 48, eval: 15 },
    { tipo: 'PLAN_MEJORA',         tienda: pick(conVenta('BITEL', false)),   provAnt: 'BITEL',     provNvo: 'BITEL',    creado: 50, aprob: 46, ejec: 38, eval: 6 },
  ]
  const momento = (diasAtras: number) => conSeg(addMin(diaLima(diasAtras), ri(9 * 60, 17 * 60)))
  const ejecMomentos = ejecutadas.map(a => ({
    creado: momento(a.creado), aprob: momento(a.aprob), ejec: momento(a.ejec), eval: momento(a.eval),
  }))
  // Ficha nueva (BORRADOR al proponer → ACTIVA al ejecutar) para cambio/renovación.
  const fichasEjec: (Row | null)[] = ejecutadas.map((a, i) => {
    const t = a.tienda, m = ejecMomentos[i]
    if (a.tipo === 'PLAN_MEJORA') return null
    const anterior = t.historiaProv[0]
    if (a.tipo === 'CAMBIO_CONTRATO') {
      // La ficha original pasa a ser del proveedor anterior.
      const fOld = fichas.find(f => f.id === anterior.fichaId)!
      const reemplazo = nuevaFicha(t, a.provAnt, { estado: 'HISTORICA', creado: fOld.creadoEn, activado: fOld.activadoEn, archivado: m.ejec, conexion: fOld.tipoConexion })
      fichas.splice(fichas.indexOf(fOld), 1)
      const quitar = new Set(nivelesDeFicha.get(fOld.id)!.map(n => n.id))
      for (let k = fichaNiveles.length - 1; k >= 0; k--) if (quitar.has(fichaNiveles[k].id)) fichaNiveles.splice(k, 1)
      anterior.prov = a.provAnt; anterior.fichaId = reemplazo.id
    } else {
      const fOld = fichas.find(f => f.id === anterior.fichaId)!
      fOld.estado = 'HISTORICA'; fOld.archivadoEn = m.ejec
      fOld.tiempoResolucionSla += 120
      fOld.fechaFin = fechaLima(addMin(m.ejec, 20 * 24 * 60)); fOld.vigenciaContrato = '24 meses'
    }
    const fNew = nuevaFicha(t, a.provNvo, { estado: 'ACTIVA', creado: addMin(m.creado, ri(60, 600)), activado: m.ejec, mejor: true, conexion: 'FIBRA OPTICA' })
    t.historiaProv.push({ desde: m.ejec, prov: a.provNvo, fichaId: fNew.id })
    return fNew
  })
  const provEn = (t: TiendaGen, d: Date) => [...t.historiaProv].reverse().find(h => h.desde <= d)!
  const ejecTienda = new Map(ejecutadas.map((a, i) => [a.tienda.id, { a, m: ejecMomentos[i] }]))

  // ═══ Planes de incidente ═══════════════════════════════════════════════════
  const GRUPOS = [
    { prov: 'CLARO' as Prov | null, zonas: ['LIMA NORTE', 'LIMA CENTRO'], tipos: Array(7).fill('CAIDA_TOTAL') as Tipo[], dias: 63, h: 10, mi: 20,
      razon: 'Corte de fibra troncal Claro — Lima Norte', motivo: 'Rotura del cable troncal por obras en Av. Túpac Amaru; afecta los nodos de Independencia y Comas.' },
    { prov: 'BITEL' as Prov | null, zonas: ['NORTE'], tipos: ['CAIDA_TOTAL', 'CAIDA_TOTAL', 'CAIDA_TOTAL', 'INTERMITENCIA', 'INTERMITENCIA'] as Tipo[], dias: 41, h: 15, mi: 5,
      razon: 'Caída del anillo de fibra Bitel — Norte', motivo: 'Falla en el anillo regional Trujillo–Chiclayo–Piura por lluvias. Bitel confirma cuadrillas en ruta.' },
    { prov: 'ENTEL' as Prov | null, zonas: ['SUR'], tipos: Array(4).fill('INTERMITENCIA') as Tipo[], dias: 24, h: 9, mi: 40,
      razon: 'Mantenimiento no programado Entel — Arequipa', motivo: 'Entel ejecutó trabajos en el nodo Cayma sin aviso previo; intermitencia generalizada.' },
    { prov: null, zonas: ['LIMA SUR'], tipos: Array(5).fill('CORTE_ELECTRICO') as Tipo[], dias: 12, h: 18, mi: 30,
      razon: 'Corte de energía Luz del Sur — Lima Sur', motivo: 'Corte no programado en Chorrillos y San Juan de Miraflores por falla en una subestación.' },
  ]
  const planes: Plan[] = []
  GRUPOS.forEach((g, gi) => g.tipos.forEach(tipo => planes.push({ estado: 'RESUELTO', tipo, grupo: gi, mit: 'NINGUNA' })))
  const totalTipo: Record<Tipo, number> = { CAIDA_TOTAL: 135, INTERMITENCIA: 75, CORTE_ELECTRICO: 45, LENTITUD: 30, OTROS: 15 }
  for (const p of planes) totalTipo[p.tipo]--
  const bolsaTipos = shuffle(TIPOS.flatMap(t => Array(totalTipo[t]).fill(t) as Tipo[]))
  const estadosResto: EstadoPlan[] = [
    ...Array(250 - planes.length).fill('RESUELTO'), ...Array(5).fill('REABIERTO'), ...Array(20).fill('CERRADO'),
    ...Array(15).fill('ACTIVO'), ...Array(10).fill('CANCELADO'),
  ]
  const resto: Plan[] = estadosResto.map((estado, i) => ({ estado, tipo: bolsaTipos[i], grupo: null, mit: 'NINGUNA' as Mit }))
  // Reabiertos y routers externos: nunca corte eléctrico (intercambio de tipo).
  const intercambiarSiCorte = (p: Plan) => {
    if (p.tipo !== 'CORTE_ELECTRICO') return
    const otro = resto.find(q => q.estado === 'RESUELTO' && q.tipo !== 'CORTE_ELECTRICO' && q.mit === 'NINGUNA' && !q.router)!
    ;[p.tipo, otro.tipo] = [otro.tipo, p.tipo]
  }
  resto.filter(p => p.estado === 'REABIERTO').forEach(intercambiarSiCorte)
  // Routers externos: 3 activos + 4 históricos (RE-002, RE-004, RE-008 ×2).
  const activos = resto.filter(p => p.estado === 'ACTIVO')
  activos.slice(0, 3).forEach((p, i) => { intercambiarSiCorte(p); p.mit = 'ROUTER_EXTERNO'; p.router = ['RE-005', 'RE-006', 'RE-007'][i] })
  const histRext = resto.filter(p => p.estado === 'RESUELTO' && p.tipo !== 'CORTE_ELECTRICO').slice(0, 4)
  // RE-002: usado y devuelto · RE-004: usado hace días, pendiente de retorno · RE-008: despliegue → retorno → despliegue.
  const histDias: [number, number][] = [[45, 60], [3, 7], [72, 80], [26, 34]]
  histRext.forEach((p, i) => { p.mit = 'ROUTER_EXTERNO'; p.router = ['RE-002', 'RE-004', 'RE-008', 'RE-008'][i]; p.dias = histDias[i] })
  planes.push(...resto)

  // Mitigación: 60% de los no cancelados; 40% router / 30% datos / 20% boleta / 10% cambio de tipo.
  const elegibles = planes.filter(p => p.estado !== 'CANCELADO')
  const M = Math.round(elegibles.length * 0.6)
  const yaRouter = planes.filter(p => p.mit === 'ROUTER_EXTERNO').length
  const cortesElig = shuffle(elegibles.filter(p => p.tipo === 'CORTE_ELECTRICO' && p.mit === 'NINGUNA'))
  const cupoBoleta = Math.round(M * 0.2)
  const cortesMit = cortesElig.slice(0, Math.min(Math.round(cortesElig.length * 0.6), cupoBoleta))
  cortesMit.forEach(p => { p.mit = 'BOLETA_MANUAL' })
  const libres = shuffle(elegibles.filter(p => p.tipo !== 'CORTE_ELECTRICO' && p.mit === 'NINGUNA'))
  const bolsaMit: Mit[] = [
    ...Array(Math.round(M * 0.4) - yaRouter).fill('ROUTER_PROPIO'), ...Array(Math.round(M * 0.3)).fill('DATOS_MOVILES'),
    ...Array(cupoBoleta - cortesMit.length).fill('BOLETA_MANUAL'), ...Array(M - Math.round(M * 0.4) - Math.round(M * 0.3) - cupoBoleta).fill('MULTI'),
  ]
  bolsaMit.forEach((m, i) => {
    const p = libres[i]
    p.mit = m
    if (m === 'MULTI') p.multi = pick<[TipoMitigacionTramo, TipoMitigacionTramo]>([
      ['DATOS_MOVILES', 'ROUTER_PROPIO'], ['BOLETA_MANUAL', 'DATOS_MOVILES'], ['ROUTER_PROPIO', 'DATOS_MOVILES'], ['DATOS_MOVILES', 'BOLETA_MANUAL'],
    ])
  })
  log(`planes: ${planes.length} — mitigados ${planes.filter(p => p.mit !== 'NINGUNA').length}/${elegibles.length}`)

  // Impacto: ALTO 40% / MEDIO 35% / BAJO 25%, correlacionado con el tipo.
  const SEVERIDAD: Record<Tipo, number> = { CAIDA_TOTAL: 3, CORTE_ELECTRICO: 2.6, INTERMITENCIA: 1.6, OTROS: 1.3, LENTITUD: 0.8 }
  const orden = planes.map((p, i) => ({ i, s: SEVERIDAD[p.tipo] + gauss() * 0.9 })).sort((a, b) => b.s - a.s)
  const impacto: string[] = []
  orden.forEach((o, k) => { impacto[o.i] = k < 120 ? 'ALTO' : k < 225 ? 'MEDIO' : 'BAJO' })

  // ═══ Distribución temporal ═════════════════════════════════════════════════
  const pesoDia: number[] = []
  const picos = new Set<number>()
  while (picos.size < 3) picos.add(ri(5, 85))
  for (let n = 0; n <= 89; n++) {
    const dow = lima(addMin(diaLima(n), 12 * 60)).dow
    let w = dow === 0 ? 0.55 : dow === 6 ? 0.75 : 1
    w *= ru(0.6, 1.4)
    if (picos.has(n)) w *= 3.2 // tormentas / cortes de fibra sin grupo masivo
    pesoDia[n] = w
  }
  function horaDelDia(): number {
    if (chance(0.85)) return pesado(Array.from({ length: 14 }, (_, k) => [8 + k, [10, 12, 13, 18, 19].includes(8 + k) ? 1.6 : 1] as [number, number]))
    return pick([22, 23, 0, 1, 2, 5, 6, 7, 7, 6])
  }
  const momentoRegistro = (): Date => {
    const n = pesado(pesoDia.map((w, i) => [i, w] as [number, number]))
    return conSeg(addMin(diaLima(n), horaDelDia() * 60 + ri(0, 59)))
  }

  // ═══ Simulación de cada incidente ══════════════════════════════════════════
  const incidentes: Row[] = [], tramos: Row[] = [], escalamientos: Row[] = [], atc: Row[] = []
  const historial: Row[] = []
  const gruposRows: Row[] = GRUPOS.map(g => ({ id: randomUUID(), razon: g.razon, motivo: g.motivo }))
  const P_REND: [string, number][] = [['EFECTIVO', 50], ['PARCIAL', 35], ['NULO', 15]]
  const routerUso = new Map<string, { incId: string; tiendaId: string; desde: Date; hasta: Date | null }[]>()

  function respuestaProveedor(p: Prov): number {
    const c = PROVS[p]
    return clamp(logn(c.respMed, c.respSig), c.respMin, c.respMax)
  }

  function elegirTienda(plan: Plan, reg: Date, finEstimado: number, relajarZona = false): TiendaGen | null {
    const g = plan.grupo != null ? GRUPOS[plan.grupo] : null
    const cand = tiendas.filter(t => {
      if (t.creadoEn > reg) return false
      const h = provEn(t, reg)
      if (g) {
        // Plan B si la zona no alcanza: mismo proveedor, mismo ámbito (Lima / provincia).
        if (!g.zonas.includes(t.zona) && !(relajarZona && g.zonas[0].startsWith('LIMA') === esLima(t.loc))) return false
        if (g.prov && h.prov !== g.prov) return false
      }
      if (plan.mit === 'ROUTER_EXTERNO' && t.tieneContingencia) return false
      if ((plan.mit === 'ROUTER_PROPIO' || plan.multi?.includes('ROUTER_PROPIO')) && !t.tieneContingencia) return false
      const e = ejecTienda.get(t.id)
      if (e && reg.getTime() < e.m.ejec.getTime() && reg.getTime() + finEstimado * MIN > e.m.ejec.getTime() - 6 * HORA) return false
      const ini = (plan.estado === 'REABIERTO' ? reg.getTime() : reg.getTime()) - 30 * MIN
      const fin = reg.getTime() + finEstimado * MIN + 30 * MIN
      return !t.intervalos.some(([a, b]) => a < fin && b > ini)
    })
    if (!cand.length) return g && !relajarZona ? elegirTienda(plan, reg, finEstimado, true) : null
    return pesado(cand.map(t => {
      let w = PROVS[provEn(t, reg).prov].fragil
      w *= (t as any)._fragil ??= clamp(logn(1, 0.55), 0.3, 3.5)
      const cx = fichas.find(f => f.id === provEn(t, reg).fichaId)!.tipoConexion
      if (cx === 'WIRELESS') w *= 1.5
      if (cx === 'HFC') w *= 1.2
      const e = ejecTienda.get(t.id)
      // Tiendas con acción ejecutada: el motivo de la acción se ve en los datos (antes peor, después mejor).
      if (e) w *= reg < e.m.ejec ? 6 : 0.4
      return [t, w] as [TiendaGen, number]
    }))
  }

  let ticketInvgate = 61_240
  const ordenPlanes = planes.map((p, i) => ({ p, i }))
  // Los grupos primero (tienen tienda restringida), luego el resto al azar.
  ordenPlanes.sort((a, b) => (a.p.grupo != null ? 0 : 1) - (b.p.grupo != null ? 0 : 1))

  for (const { p: plan, i: idx } of ordenPlanes) {
    for (let intento = 0; intento < 200; intento++) {
      const r = simular(plan, idx)
      if (r) break
      if (intento === 199) throw new Error(`No se pudo ubicar el incidente #${idx} (${plan.estado} ${plan.tipo})`)
    }
  }

  function simular(plan: Plan, idx: number): boolean {
    const tipo = plan.tipo
    const esCorte = tipo === 'CORTE_ELECTRICO'
    const g = plan.grupo != null ? GRUPOS[plan.grupo] : null
    // ── Momento de registro ──
    let reg: Date
    if (g) {
      const base = desdeLima(lima(diaLima(g.dias)).y, lima(diaLima(g.dias)).m, lima(diaLima(g.dias)).d, g.h, g.mi)
      reg = conSeg(addMin(base, ri(0, 45)))
    } else if (plan.dias) {
      reg = conSeg(addMin(diaLima(ri(plan.dias[0], plan.dias[1])), horaDelDia() * 60 + ri(0, 59)))
    } else if (plan.estado === 'ACTIVO') {
      const atras = plan.mit === 'ROUTER_EXTERNO' ? ru(4 * 60, 30 * 60) : clamp(logn(300, 1.0), 25, 70 * 60)
      reg = conSeg(addMin(AHORA, -atras))
    } else {
      reg = momentoRegistro()
    }
    // ── Duración aproximada para reservar la tienda (se refina abajo) ──
    const tienda = elegirTienda(plan, reg, plan.estado === 'ACTIVO' ? minEntre(reg, AHORA) : 900)
    if (!tienda) return false
    const hp = provEn(tienda, reg)
    const prov: Prov | null = esCorte ? null : hp.prov
    const ficha = fichas.find(f => f.id === hp.fichaId)!
    const id = randomUUID()
    const agente = pick(agentes)
    const activo = plan.estado === 'ACTIVO'

    // Reabiertos: período 1 corto, cerrado por error/prematuro; el período 2 es el que se simula.
    let reg0: Date | null = null, fin0: Date | null = null, mttr0 = 0
    if (plan.estado === 'REABIERTO') {
      reg0 = reg
      fin0 = conSeg(addMin(reg0, clamp(logn(45, 0.5), 15, 180)))
      mttr0 = Math.round(minEntre(reg0, fin0))
      reg = conSeg(addMin(fin0, clamp(logn(80, 0.6), 15, 480)))
    }

    // ── Escalamiento al proveedor ──
    let escalado = !esCorte && (g != null || plan.mit === 'ROUTER_EXTERNO' || chance(P_ESCALA[tipo]))
    if (plan.estado === 'CANCELADO') escalado = !esCorte && chance(0.2)
    const respondio = escalado && plan.estado !== 'CANCELADO' && chance(0.74)
    const envio1 = conSeg(addMin(reg, clamp(logn(16, 0.5), 5, 60)))
    const R = prov ? respuestaProveedor(prov) : 0
    const repFactor = prov ? PROVS[prov].rep : 1

    // ── Fin natural del incidente ──
    let finNatural: Date
    if (escalado && respondio) finNatural = addMin(envio1, R + clamp(logn(REPARACION[tipo] * repFactor, 0.8), 15, 30 * 60))
    else if (escalado) finNatural = addMin(envio1, clamp(logn(170 * repFactor, 0.7), 40, 24 * 60))
    else finNatural = addMin(reg, clamp(logn(DUR_SIN_ESCALAR[tipo], 0.7), 10, 20 * 60))
    if (g && esCorte) finNatural = addMin(reg, clamp(logn(150, 0.3), 90, 300))

    let fin: Date | null
    if (activo) fin = null
    else if (plan.estado === 'CANCELADO') fin = conSeg(addMin(reg, clamp(logn(25, 0.6), 6, 150)))
    else if (plan.estado === 'CERRADO') fin = conSeg(addMin(finNatural, clamp(logn(45, 0.8), 5, 600)))
    else fin = conSeg(finNatural)
    if (fin && fin.getTime() > AHORA.getTime() - 20 * MIN) return false
    if (activo && finNatural.getTime() < AHORA.getTime() && !plan.router && chance(0.7)) return false
    const limite = fin ?? AHORA

    // Reserva definitiva de la tienda (sin solapes con otros incidentes suyos).
    const ini = (reg0 ?? reg).getTime(), finRes = limite.getTime()
    if (tienda.intervalos.some(([a, b]) => a < finRes + 30 * MIN && b > ini - 30 * MIN)) return false
    const e = ejecTienda.get(tienda.id)
    if (e && ini < e.m.ejec.getTime() && finRes > e.m.ejec.getTime() - 6 * HORA) return false

    // ── Escalamientos (N1 → N2 → N3) ──
    const misAtc: Row[] = [] // se confirman solo si el intento prospera
    const escs: Row[] = []
    let primeraResp: Date | null = null
    if (escalado && envio1 < limite) {
      const n2Tras = ru(100, 170), n3Tras = n2Tras + ru(120, 200)
      const respAt = respondio ? addMin(envio1, R) : null
      const respValida = respAt && respAt < limite ? respAt : null
      const niveles = nivelesDeFicha.get(ficha.id)!
      const envios: Date[] = [envio1]
      const corte = respValida ?? limite
      if (minEntre(envio1, corte) > n2Tras) envios.push(conSeg(addMin(envio1, n2Tras)))
      if (minEntre(envio1, corte) > n3Tras && (respondio || chance(0.55))) envios.push(conSeg(addMin(envio1, n3Tras)))
      const inc = {
        codigo: '__CODIGO__', tiendaCodigo: tienda.codigo, tiendaNombre: tienda.nombreCc, tiendaDistrito: tienda.distrito,
        tiendaDireccion: tienda.direccion, proveedorNombre: prov, tiendaCid: ficha.cidServicio, tiendaTipoConexion: ficha.tipoConexion,
        tipo, horaRegistro: reg.toISOString(), usuariosAfectados: null as any,
      }
      envios.forEach((env, k) => {
        const nv = niveles[k]
        const ultimo = k === envios.length - 1
        const respondida = ultimo && respValida
        const esc: Row = {
          id: randomUUID(), incidenteId: id, nivel: k + 1, fichaNivelId: nv.id,
          contactoEscalado: nv.nombreContacto, emailContacto: nv.email, telefonoContacto: nv.celular,
          tiempoEstimadoSolucion: null, horaEnvioCorreo: env, horaRespuesta: null, tiempoRespuestaMin: null,
          estadoCronometro: 'CORRIENDO', respuestaTexto: null, noHuboRespuesta: false,
          creadoPorId: agente.id, creadoEn: addMin(env, -ru(1, 4)),
          _inc: inc, _prev: escs.map(x => ({ horaEnvioCorreo: x.horaEnvioCorreo.toISOString() })), _nivel: nv,
        }
        if (respondida) {
          const tk = PROVS[prov!].ticket()
          esc.horaRespuesta = respValida
          esc.tiempoRespuestaMin = Math.round(minEntre(env, respValida!))
          esc.estadoCronometro = 'RESPONDIDO'
          esc.respuestaTexto = pick(TX.RESPUESTAS_PROVEEDOR).replace('{T}', tk)
          esc.tiempoEstimadoSolucion = pick(['60', '120', '180', '240', ''])
          esc._ticket = tk
          primeraResp = respValida
          // Respuesta por teléfono: la llamada ATC finalizada sella la respuesta.
          if (chance(0.4)) {
            const dur = ri(4, 18)
            misAtc.push({ id: randomUUID(), escalamientoId: esc.id, inicio: addMin(respValida!, -dur), fin: respValida, duracionMin: dur,
              notas: pick(TX.NOTAS_ATC).replace('{T}', tk), creadoEn: addMin(respValida!, -dur) })
          }
          if (chance(0.15)) {
            const ini2 = addMin(respValida!, ru(30, 150)), dur = ri(3, 12)
            if (addMin(ini2, dur) < limite) misAtc.push({ id: randomUUID(), escalamientoId: esc.id, inicio: ini2, fin: addMin(ini2, dur),
              duracionMin: dur, notas: pick(TX.NOTAS_ATC).replace('{T}', tk), creadoEn: ini2 })
          }
        } else if (!activo) {
          // Al cerrar, resolver (y el backfill de arranque para CERRADO/CANCELADO)
          // marcan "sin respuesta" los enviados que nunca se contestaron.
          esc.noHuboRespuesta = true
          esc.estadoCronometro = 'VENCIDO'
        }
        escs.push(esc)
      })
    }

    // ── Escalado a Infraestructura interna ──
    const pInfra: Record<Tipo, number> = { OTROS: 0.5, LENTITUD: 0.25, INTERMITENCIA: 0.08, CAIDA_TOTAL: 0.04, CORTE_ELECTRICO: 0 }
    let infra: Row | null = null
    if (plan.estado !== 'CANCELADO' && chance(pInfra[tipo])) {
      const h = conSeg(addMin(reg, ru(20, 90)))
      if (h < limite) infra = { escaladoInfraId: pick(infras).id, horaEscaladoInfra: h, notaEscaladoInfra: pick(TX.NOTAS_INFRA) }
    }

    // ── Tramos de mitigación (sin huecos desde horaRegistro) ──
    const tiendaVenta = { ventaHoraSoles: tienda.ventaHoraSoles, ventaHoraFdsSoles: tienda.ventaHoraFdsSoles }
    const durMin = minEntre(reg, limite)
    let mit = plan.mit
    if (mit !== 'NINGUNA' && mit !== 'ROUTER_EXTERNO' && durMin < 10) mit = 'NINGUNA'
    if (mit === 'ROUTER_EXTERNO' && durMin < 170) return false
    const segs: { tipo: TipoMitigacionTramo; desde: Date; hasta: Date | null; rend?: string; router?: string }[] = []
    const factorSin = factorBaseSinMitigacion(tipo)
    if (mit === 'NINGUNA') {
      segs.push({ tipo: 'SIN_MITIGACION', desde: reg, hasta: fin })
    } else {
      const a = conSeg(mit === 'ROUTER_EXTERNO' ? addMin(reg, ru(80, 150)) : addMin(reg, clamp(logn(25, 0.6), 5, durMin * 0.5)))
      segs.push({ tipo: 'SIN_MITIGACION', desde: reg, hasta: a })
      if (mit === 'MULTI') {
        const b = conSeg(addMin(a, minEntre(a, limite) * ru(0.3, 0.6)))
        segs.push({ tipo: plan.multi![0], desde: a, hasta: b, rend: pesado([['PARCIAL', 50], ['NULO', 35], ['EFECTIVO', 15]]) })
        segs.push({ tipo: plan.multi![1], desde: b, hasta: fin, rend: pesado(P_REND) })
      } else {
        const tipoM = mit as TipoMitigacionTramo
        const rend = pesado(P_REND)
        if (!activo && chance(0.25) && tipoM !== 'ROUTER_EXTERNO') {
          const d = conSeg(addMin(a, minEntre(a, limite) * ru(0.4, 0.85)))
          segs.push({ tipo: tipoM, desde: a, hasta: d, rend })
          segs.push({ tipo: 'SIN_MITIGACION', desde: d, hasta: fin })
        } else {
          segs.push({ tipo: tipoM, desde: a, hasta: fin, rend, router: plan.router })
        }
      }
    }
    const misTramos: Row[] = segs.map(sg => {
      const factor = sg.tipo === 'SIN_MITIGACION' ? factorSin : normFactorMitigacion(sg.rend)
      const ie = sg.hasta ? calcIeTramo({ tipo: sg.tipo, factor, desde: sg.desde, hasta: sg.hasta, tipoIncidente: tipo }, tiendaVenta, sg.hasta) : null
      return {
        id: randomUUID(), incidenteId: id, tipo: sg.tipo, factor: factor.toFixed(4), activadoPor: null, observacion: null,
        routerExternoId: sg.router ?? null, desde: sg.desde, hasta: sg.hasta, ieTramo: ie == null ? null : String(ie), origen: 'SISTEMA',
        creadoEn: sg.desde, actualizadoEn: sg.hasta ?? sg.desde,
      }
    })

    // ── Descartes ──
    const desc: Row = {}
    const conDescartes = !esCorte && plan.estado !== 'CANCELADO' ? chance(0.85) : false
    if (conDescartes) {
      const sino = (pTrue: number) => (chance(0.07) ? null : chance(pTrue))
      desc.descEnergia = sino(0.96)
      desc.descRouter = sino(tipo === 'CAIDA_TOTAL' ? 0.45 : 0.85)
      if (reg >= REDISENO_DESCARTES) {
        desc.descCableado = sino(0.88)
        desc.descReinicioEquipo = sino(0.82)
      } else {
        desc.descDns = sino(0.35)
      }
      desc.checkIpconfig = chance(0.85); desc.checkRenovarIp = chance(0.35); desc.checkPingGw = chance(0.8)
      desc.checkPingInternet = chance(0.75); desc.checkTracert = chance(0.4); desc.checkDns = chance(0.45)
      desc.descartesDetallado = chance(0.35) ? pick(TX.DESCARTES_DETALLE) : ''
    }

    // ── Resolución ──
    let resueltoPor: string | null = null, atribucion: string | null = null, evaluable = !esCorte, resolvedor: Row | null = null
    if (plan.estado === 'RESUELTO' || plan.estado === 'REABIERTO') {
      if (esCorte) resueltoPor = chance(0.9) ? 'ENERGIA_ELECTRICA' : 'AGENTE'
      else if (infra && chance(0.7)) resueltoPor = 'INFRAESTRUCTURA'
      else if (escalado && primeraResp) resueltoPor = chance(0.85) ? 'PROVEEDOR' : 'AGENTE'
      else if (escalado) resueltoPor = chance(0.4) ? 'PROVEEDOR' : 'AGENTE'
      else resueltoPor = chance(0.2) ? 'PROVEEDOR' : 'AGENTE'
      resolvedor = resueltoPor === 'INFRAESTRUCTURA' || chance(0.18) ? pick(supervisores) : pick(agentes)
      const esSup = resolvedor.rol === 'SUPERVISOR'
      if (resueltoPor === 'PROVEEDOR') { atribucion = null; evaluable = true }
      else if (resueltoPor === 'AGENTE') { atribucion = 'Gestión interna Service Desk'; evaluable = !esSup }
      else if (resueltoPor === 'INFRAESTRUCTURA') { atribucion = 'Gestión Infraestructura interna'; evaluable = false }
      else { atribucion = 'Regresó energía eléctrica'; evaluable = false }
    }

    // ── Registro del incidente ──
    const editado = conDescartes || plan.estado !== 'ACTIVO'
    const regFinal = editado ? new Date(Math.floor(reg.getTime() / MIN) * MIN) : reg
    if (editado && misTramos[0]) { misTramos[0].desde = regFinal; misTramos[0].creadoEn = regFinal }
    if (misTramos[0]?.hasta && misTramos[0].ieTramo != null) {
      misTramos[0].ieTramo = String(calcIeTramo({ tipo: misTramos[0].tipo, factor: misTramos[0].factor, desde: regFinal, hasta: misTramos[0].hasta, tipoIncidente: tipo }, tiendaVenta, misTramos[0].hasta))
    }
    const usuariosAfectados = String(tipo === 'CAIDA_TOTAL' || esCorte ? ri(3, 12) : ri(1, 8))
    const estadoDb = plan.estado === 'ACTIVO'
      ? (escs.length ? `ESCALADO_N${Math.min(escs.length, 3)}` : 'ABIERTO')
      : plan.estado === 'REABIERTO' ? 'RESUELTO' : plan.estado
    const motivoReap = plan.estado === 'REABIERTO' ? (chance(0.8) ? 'TIENDA_SIN_INTERNET' : 'ERROR_AGENTE') : null
    const justif = motivoReap ? pick(TX.JUSTIFICACION_REAPERTURA[motivoReap]) : null
    let ieiAcumulado: string | null = null
    if (plan.estado === 'REABIERTO') {
      const r = calcImpactoRow({
        hora_registro: reg0!, hora_fin: fin0!, estado: 'RESUELTO', tipo,
        venta_hora_soles: tienda.ventaHoraSoles, venta_hora_fds_soles: tienda.ventaHoraFdsSoles, cluster: tienda.cluster,
      })
      ieiAcumulado = String(r.impactoEconomicoEstimado ?? 0)
    }
    const respTicket = escs.find(x => x._ticket)?._ticket ?? null
    const row: Row = {
      id, codigo: '', tiendaId: tienda.id, registradoPorId: agente.id, nivelImpacto: impacto[idx],
      usuariosAfectados, descripcionInicial: editado ? '' : null, tipo, estado: estadoDb,
      ticketInvgate: chance(0.85) ? String(ticketInvgate += ri(2, 5)) : (editado ? '' : null),
      ticketProveedor: respTicket, descartesRealizados: editado ? '' : null,
      solucionAplicada: resueltoPor && chance(0.75) ? pick(TX.SOLUCIONES[resueltoPor]) : (editado ? '' : null),
      horaRegistro: regFinal, horaFin: fin,
      mttrMinutos: fin && plan.estado !== 'CANCELADO' ? Math.round(minEntre(regFinal, fin)) + mttr0 : null,
      observaciones: chance(0.4) ? pick(TX.OBSERVACIONES[tipo]) : (editado ? '' : null),
      reabiertaInfo: motivoReap
        ? `Reabierto el ${reg.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${motivoReap === 'TIENDA_SIN_INTERNET' ? 'Tienda nuevamente sin internet' : 'Error de gestión de agente'} — ${justif}`
        : null,
      motivoReabertura: motivoReap, justificacionReabertura: justif,
      tiempoAcumuladoMin: null, ieiAcumulado,
      horaRegistroOriginal: reg0, horaFinAnterior: fin0,
      proveedorId: prov ? provId[prov] : null,
      tipoPersonalizado: tipo === 'OTROS' ? pick(TX.TIPOS_OTROS) : null,
      otrosClasificacion: tipo === 'OTROS' ? pick(TX.OTROS_CLASIFICACION) : null,
      actualizadoEn: fin ?? (escs.length ? escs[escs.length - 1].horaEnvioCorreo : regFinal),
      operacionManual: false, contEsExterno: false,
      checkIpconfig: false, checkPingGw: false, checkPingInternet: false, checkTracert: false, checkDns: false, checkRenovarIp: false,
      ...desc,
      resueltoPor, atribucionFinal: atribucion, evaluableProveedor: evaluable,
      cajasAfectadas: !esCorte && chance(0.3) ? ri(1, 4) : null,
      alcanceCorte: esCorte ? (g ? 'ZONA_AMPLIA' : pesado([['SOLO_TIENDA', 40], ['MALL', 30], ['CUADRA_CALLE', 20], ['ZONA_AMPLIA', 10]])) : null,
      tuvoUps: esCorte ? chance(0.3) : null,
      grupoMasivoId: g ? gruposRows[plan.grupo!].id : null,
      fichaId: esCorte ? null : ficha.id,
      ...(infra ?? {}),
      canceladoPorId: plan.estado === 'CANCELADO' ? (chance(0.7) ? agente.id : pick(supervisores).id) : null,
      cerradoPorId: plan.estado === 'CERRADO' ? pick(supervisores).id : null,
      resueltoPorUsuarioId: resolvedor?.id ?? null,
      _plan: plan, _tienda: tienda, _escs: escs, _primeraResp: primeraResp, _creado: reg0 ?? reg, _ficha: ficha,
    }
    if (row.observaciones === undefined) row.observaciones = null
    if (plan.estado === 'CANCELADO') row.observaciones = pick(['Registrado por error: la tienda tenía un problema en una PC.', 'Duplicado de otro incidente de la misma tienda.', 'La tienda confirma que el servicio volvió antes de gestionar.'])
    for (const esc of escs) esc._inc.usuariosAfectados = usuariosAfectados

    incidentes.push(row)
    tramos.push(...misTramos)
    escalamientos.push(...escs)
    atc.push(...misAtc)
    tienda.intervalos.push([ini, finRes])

    // tiendas_historial que escribe POST /mitigacion al activar/desactivar router.
    misTramos.forEach((tr, k) => {
      const esRouter = tr.tipo === 'ROUTER_PROPIO' || tr.tipo === 'ROUTER_EXTERNO'
      if (esRouter) historial.push({ id: randomUUID(), tiendaId: tienda.id, usuarioId: agente.id, campoEditado: 'contingenciaActiva',
        valorAnterior: 'false', valorNuevo: `true — vía incidente ${id} (tramo ${tr.tipo})`, editadoEn: tr.desde, motivo: '' })
      const ant = misTramos[k - 1]
      if (ant && (ant.tipo === 'ROUTER_PROPIO' || ant.tipo === 'ROUTER_EXTERNO') && !esRouter) historial.push({ id: randomUUID(), tiendaId: tienda.id,
        usuarioId: agente.id, campoEditado: 'contingenciaActiva', valorAnterior: 'true', valorNuevo: `false — vía incidente ${id} (tramo ahora ${tr.tipo})`,
        editadoEn: tr.desde, motivo: '' })
      if (tr.tipo === 'ROUTER_EXTERNO') {
        const lista = routerUso.get(plan.router!) ?? []
        lista.push({ incId: id, tiendaId: tienda.id, desde: tr.desde, hasta: tr.hasta })
        routerUso.set(plan.router!, lista)
      }
    })
    return true
  }
  log(`incidentes: ${incidentes.length}, tramos: ${tramos.length}, escalamientos: ${escalamientos.length}, atc: ${atc.length}`)

  // ═══ Códigos: secuencia netdesk_inc_seq compartida con grupos masivos ══════
  const gruposCreados = gruposRows.map((gr, gi) => {
    const miembros = incidentes.filter(i => i.grupoMasivoId === gr.id).sort((a, b) => a._creado - b._creado)
    gr.creadoEn = conSeg(addMin(miembros[0]._creado, ri(20, 40)))
    gr.creadoPorId = pick(supervisores).id
    return gr
  })
  const eventos = [
    ...incidentes.map(i => ({ t: i._creado.getTime(), set: (n: number) => { i.codigo = String(n).padStart(5, '0') + String.fromCharCode(65 + ri(0, 25)) } })),
    ...gruposCreados.map(gr => ({ t: gr.creadoEn.getTime(), set: (n: number) => { gr.codigo = 'GM-' + String(n).padStart(5, '0') } })),
  ].sort((a, b) => a.t - b.t)
  eventos.forEach((ev, k) => ev.set(k + 1))
  const ultimoSeq = eventos.length
  // Cuerpo del correo: lo arma buildCorreo, igual que el detalle del incidente.
  for (const inc of incidentes) {
    for (const esc of inc._escs) {
      esc._inc.codigo = inc.codigo
      Object.assign(esc._inc, Object.fromEntries(Object.entries(inc).filter(([k]) => k.startsWith('desc') || k.startsWith('check'))))
      esc.cuerpoCorreo = buildCorreo(esc._inc, esc._nivel, esc.nivel, esc._prev)
    }
  }

  // ═══ Backfill de proveedor al ejecutar un CAMBIO_CONTRATO ══════════════════
  for (const [i, a] of ejecutadas.entries()) {
    if (a.tipo !== 'CAMBIO_CONTRATO') continue
    for (const inc of incidentes) {
      if (inc.tiendaId === a.tienda.id && inc.proveedorId == null && inc._creado < ejecMomentos[i].ejec) inc.proveedorId = provId[a.provAnt]
    }
    historial.push({ id: randomUUID(), tiendaId: a.tienda.id, usuarioId: supervisores[0].id, campoEditado: 'proveedor_id',
      valorAnterior: provId[a.provAnt], valorNuevo: `${provId[a.provNvo]} — vía __AC${i}__`, editadoEn: ejecMomentos[i].ejec, motivo: '' })
  }

  // ═══ Alertas SLA (lo que habría insertado el cron cada 15 min) ═════════════
  const alertas: Row[] = []
  for (const inc of incidentes) {
    const escs = inc._escs as Row[]
    if (!escs.length) continue
    const envio = escs[0].horaEnvioCorreo as Date
    const resp = inc._primeraResp as Date | null
    const f = inc._ficha
    const slaR = f.tiempoRespuestaSla ?? 60, slaS = f.tiempoResolucionSla ?? 90
    const fin = (inc.horaFin as Date | null) ?? AHORA
    const ultimo: Record<string, number> = {}
    let t = Math.ceil(envio.getTime() / (15 * MIN)) * 15 * MIN
    for (; t < fin.getTime(); t += 15 * MIN) {
      let tipo: string | null = null
      if (!resp || t < resp.getTime()) {
        const ratio = (t - envio.getTime()) / MIN / slaR
        tipo = ratio >= 1 ? 'RESPUESTA_VENCIDA' : ratio >= 0.7 ? 'RESPUESTA_EN_RIESGO' : null
      } else {
        const ratio = (t - resp.getTime()) / MIN / slaS
        tipo = ratio >= 1 ? 'RESOLUCION_VENCIDA' : ratio >= 0.7 ? 'RESOLUCION_EN_RIESGO' : null
      }
      if (!tipo) continue
      if (ultimo[tipo] != null && t - ultimo[tipo] < 2 * HORA) continue
      ultimo[tipo] = t
      alertas.push({ id: randomUUID(), incidenteId: inc.id, tipo, enviadoEn: new Date(t + ri(2, 40) * 1000) })
    }
  }

  // ═══ Routers de contingencia ═══════════════════════════════════════════════
  const ROUTERS = [
    { codigo: 'RE-001', marca: 'TP-Link', modelo: 'Archer MR600', fotos: true },
    { codigo: 'RE-002', marca: 'Huawei', modelo: 'B535-232', fotos: false },
    { codigo: 'RE-003', marca: 'ZTE', modelo: 'MF286D', fotos: false },
    { codigo: 'RE-004', marca: 'TP-Link', modelo: 'TL-MR6400', fotos: true },
    { codigo: 'RE-005', marca: 'Huawei', modelo: 'B311-221', fotos: false },
    { codigo: 'RE-006', marca: 'TP-Link', modelo: 'Archer MR600', fotos: true },
    { codigo: 'RE-007', marca: 'ZTE', modelo: 'MF971R', fotos: false },
    { codigo: 'RE-008', marca: 'Huawei', modelo: 'B535-232', fotos: false },
  ]
  const routers: Row[] = [], routerHist: Row[] = []
  const routerId: Record<string, string> = {}
  for (const r of ROUTERS) {
    routerId[r.codigo] = randomUUID()
    routers.push({
      id: routerId[r.codigo], codigo: r.codigo, marca: r.marca, modelo: r.modelo,
      serie: r.marca === 'TP-Link' ? `22A${digitos(1)}W${digitos(7)}` : r.marca === 'Huawei' ? `HQ${digitos(2)}${'ABCDEFGH'[ri(0, 7)]}${digitos(7)}` : `ZTE${digitos(9)}`,
      chip: celular().replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'), plan: pick(['40 GB', '60 GB', '80 GB']),
      observaciones: null, estado: 'DISPONIBLE', tiendaActualId: null, fotos: r.fotos ? [PNG_1PX] : [],
      almacenActual: null, activo: true, creadoEn: conSeg(addMin(diaLima(ri(200, 320)), 11 * 60)),
    })
  }
  const R = (c: string) => routers.find(r => r.id === routerId[c])!
  const histPush = (codigo: string, h: Row) => routerHist.push({ id: randomUUID(), routerId: routerId[codigo], tiempoUsoMin: null, ...h, creadoEn: h.fechaIngreso })
  const supId = () => pick(supervisores).id
  // Préstamos preventivos viejos (antes de la ventana de 3 meses).
  for (const [c, alm] of [['RE-001', 'Almacén Vulcano'], ['RE-003', 'Almacén Vulcano']] as const) {
    const t = pick(tiendas.filter(x => !x.tieneContingencia && !x.nueva))
    const ida = momento(ri(130, 150)), vuelta = momento(ri(105, 125))
    histPush(c, { tiendaId: t.id, fechaIngreso: ida, fechaRetorno: null, accion: 'DESPLIEGUE', almacenOrigen: null, almacenDestino: null, nota: 'Préstamo preventivo por inventario anual.', registradoPorId: supId() })
    histPush(c, { tiendaId: t.id, fechaIngreso: vuelta, fechaRetorno: vuelta, accion: 'RETORNO', almacenOrigen: null, almacenDestino: alm, nota: null, registradoPorId: supId() })
    Object.assign(R(c), { estado: 'DISPONIBLE', almacenActual: alm })
  }
  // Usos en incidentes (orden cronológico por router).
  for (const [c, usos] of routerUso) {
    usos.sort((a, b) => a.desde.getTime() - b.desde.getTime())
    const almacen = c === 'RE-002' ? 'Almacén Jiron' : 'Almacén Vulcano'
    usos.forEach((u, k) => {
      const ida = addMin(u.desde, -ru(10, 30))
      // DESPLIEGUE guarda como origen el almacenActual que tenía el equipo (null = "En área TI").
      histPush(c, { tiendaId: u.tiendaId, fechaIngreso: ida, fechaRetorno: null, accion: 'DESPLIEGUE', almacenOrigen: R(c).almacenActual, almacenDestino: null, nota: `Contingencia por incidente ${incidentes.find(i => i.id === u.incId)!.codigo}`, registradoPorId: supId() })
      const hayOtro = k < usos.length - 1
      if (c === 'RE-002' || hayOtro) {
        const vuelta = addMin(u.hasta!, ru(2, 5) * 24 * 60)
        histPush(c, { tiendaId: u.tiendaId, fechaIngreso: vuelta, fechaRetorno: vuelta, accion: 'RETORNO', almacenOrigen: null, almacenDestino: almacen, nota: 'Retorno tras cierre del incidente.', registradoPorId: supId() })
        Object.assign(R(c), { estado: 'DISPONIBLE', tiendaActualId: null, almacenActual: almacen })
      } else {
        Object.assign(R(c), { estado: u.hasta ? 'EN_TIENDA_INACTIVO' : 'EN_TIENDA_ACTIVO', tiendaActualId: u.tiendaId, almacenActual: null })
      }
    })
  }
  for (const tr of tramos) if (tr.routerExternoId) tr.routerExternoId = routerId[tr.routerExternoId]
  R('RE-004').observaciones = 'Pendiente de retorno a Almacén Vulcano; coordinado con el supervisor zonal.'
  R('RE-007').observaciones = 'incluye 2 antenas · batería con 70% de autonomía'

  // ═══ Gestión de cambios (15) ═══════════════════════════════════════════════
  const nIncTienda = new Map<string, number>()
  for (const i of incidentes) nIncTienda.set(i.tiendaId, (nIncTienda.get(i.tiendaId) ?? 0) + 1)
  const usadas = new Set(ejecutadas.map(a => a.tienda.id))
  const peorTienda = (provs: Prov[]) => {
    const t = tiendas.filter(x => provs.includes(x.prov) && !usadas.has(x.id) && !incidentes.some(i => i.tiendaId === x.id && !i.horaFin))
      .sort((a, b) => (nIncTienda.get(b.id) ?? 0) - (nIncTienda.get(a.id) ?? 0))[0]
    usadas.add(t.id)
    return t
  }
  interface AccDef { tipo: string; estado: string; tienda: TiendaGen; provAnt: Prov | null; provNvo: Prov | null; creado: Date; prop?: Date; aprob?: Date; cierre?: Date; ejec?: Date; evalAt?: Date
    titulo: string; motivo: string; descripcion: string; fichaNueva?: Row | null; fichaAnt?: string | null; idxEjec?: number; plan?: string; notasAprob?: string; notasEjec?: string; evalNota?: string; rechazo?: string }
  const acciones: AccDef[] = []
  ejecutadas.forEach((a, i) => {
    const m = ejecMomentos[i], t = a.tienda
    const titulos: Record<string, [string, string, string]> = {
      CAMBIO_CONTRATO: [`Cambio de ${a.provAnt} a ${a.provNvo} en ${t.codigo}`, `Reincidencia de caídas con ${a.provAnt} en ${t.codigo}; varios incidentes fuera de SLA en el último trimestre.`, `Migrar el enlace principal de ${t.codigo} a ${a.provNvo} con fibra dedicada.`],
      RENOVACION_CONTRATO: [`Renovación de contrato ${a.provAnt} en ${t.codigo}`, `Contrato por vencer; se negocia mejor SLA de resolución y más velocidad al mismo costo.`, 'Renovar por 24 meses con upgrade de velocidad.'],
      PLAN_MEJORA: [`Plan de mejora de red en ${t.codigo}`, `Incidentes internos repetidos en ${t.codigo} (cableado y switch).`, 'Recableado del gabinete, cambio de switch e instalación de UPS para equipos de red.'],
    }
    const [titulo, motivo, descripcion] = titulos[a.tipo]
    acciones.push({ tipo: a.tipo, estado: 'COMPLETADO', tienda: t, provAnt: a.provAnt, provNvo: a.tipo === 'PLAN_MEJORA' ? null : a.provNvo,
      creado: m.creado, prop: addMin(m.creado, ri(30, 240)), aprob: m.aprob, ejec: m.ejec, evalAt: m.eval, titulo, motivo, descripcion,
      fichaNueva: fichasEjec[i], fichaAnt: a.tipo === 'PLAN_MEJORA' ? null : t.historiaProv[0].fichaId, idxEjec: i,
      notasAprob: 'Aprobado por Gerencia TI.', notasEjec: a.tipo === 'PLAN_MEJORA' ? 'Trabajo realizado en horario nocturno, sin impacto en ventas.' : 'Enlace nuevo validado con la tienda; se dio de baja el anterior.',
      evalNota: a.tipo === 'PLAN_MEJORA' ? 'Bajaron los incidentes internos de la tienda.' : 'Menos incidentes y mejor tiempo de atención tras el cambio.' })
  })
  const fichaBorrador = (t: TiendaGen, prov: Prov, creado: Date) => nuevaFicha(t, prov, { estado: 'BORRADOR', creado, activado: null, mejor: true, conexion: 'FIBRA OPTICA' })
  const porVencer = (t: TiendaGen) => {
    const f = fichas.find(x => x.id === t.historiaProv[t.historiaProv.length - 1].fichaId)!
    f.fechaFin = fechaLima(addMin(AHORA, ri(15, 45) * 24 * 60)); f.vigenciaContrato = '24 meses'; f.renovacionAutomatica = false
  }
  {
    // APROBADO ×3
    const t1 = peorTienda(['CONVERGIA']), c1 = momento(25)
    acciones.push({ tipo: 'CAMBIO_CONTRATO', estado: 'APROBADO', tienda: t1, provAnt: 'CONVERGIA', provNvo: 'CLARO', creado: c1, prop: addMin(c1, 180), aprob: momento(21),
      titulo: `Cambio de CONVERGIA a CLARO en ${t1.codigo}`, motivo: `${t1.codigo} es de las tiendas con más incidentes; Convergia responde fuera de SLA.`, descripcion: 'Contratar fibra dedicada Claro y retirar el enlace Convergia.',
      fichaNueva: fichaBorrador(t1, 'CLARO', addMin(c1, 120)), notasAprob: 'Aprobado. Coordinar instalación fuera de horario comercial.', plan: fechaLima(addMin(AHORA, 9 * 24 * 60)) })
    const t2 = peorTienda(['MOVISTAR']); porVencer(t2); const c2 = momento(20)
    acciones.push({ tipo: 'RENOVACION_CONTRATO', estado: 'APROBADO', tienda: t2, provAnt: 'MOVISTAR', provNvo: 'MOVISTAR', creado: c2, prop: addMin(c2, 60), aprob: momento(15),
      titulo: `Renovación de contrato MOVISTAR en ${t2.codigo}`, motivo: 'El contrato vence este mes; se negocia upgrade a 200 Mbps.', descripcion: 'Renovar 24 meses con mejora de velocidad.',
      fichaNueva: fichaBorrador(t2, 'MOVISTAR', addMin(c2, 40)), notasAprob: 'Aprobado con la condición de mantener el costo actual.', plan: fechaLima(addMin(AHORA, 14 * 24 * 60)) })
    const t3 = peorTienda(['BITEL']), c3 = momento(18)
    acciones.push({ tipo: 'AUDITORIA_PROVEEDOR', estado: 'APROBADO', tienda: t3, provAnt: 'BITEL', provNvo: null, creado: c3, prop: addMin(c3, 90), aprob: momento(12),
      titulo: `Auditoría de servicio BITEL en ${t3.codigo}`, motivo: 'Tiempos de respuesta de Bitel por encima del SLA en provincia.', descripcion: 'Revisión conjunta con el ejecutivo de cuenta de los tickets del trimestre.',
      notasAprob: 'Aprobado. Pedir reporte de disponibilidad mensual.', plan: fechaLima(addMin(AHORA, 6 * 24 * 60)) })
    // PROPUESTO ×3
    const t4 = peorTienda(['BITEL']), c4 = momento(12)
    acciones.push({ tipo: 'CAMBIO_CONTRATO', estado: 'PROPUESTO', tienda: t4, provAnt: 'BITEL', provNvo: 'ENTEL', creado: c4, prop: addMin(c4, 240),
      titulo: `Cambio de BITEL a ENTEL en ${t4.codigo}`, motivo: `Caídas recurrentes en ${t4.codigo}; Entel tiene mejor desempeño en la zona.`, descripcion: 'Migrar el enlace principal a Entel.',
      fichaNueva: fichaBorrador(t4, 'ENTEL', addMin(c4, 200)), plan: fechaLima(addMin(AHORA, 25 * 24 * 60)) })
    const t5 = peorTienda(['CLARO']); porVencer(t5); const c5 = momento(9)
    acciones.push({ tipo: 'RENOVACION_CONTRATO', estado: 'PROPUESTO', tienda: t5, provAnt: 'CLARO', provNvo: 'CLARO', creado: c5, prop: addMin(c5, 120),
      titulo: `Renovación de contrato CLARO en ${t5.codigo}`, motivo: 'Contrato por vencer en las próximas semanas.', descripcion: 'Renovar 12 meses manteniendo el plan.',
      fichaNueva: fichaBorrador(t5, 'CLARO', addMin(c5, 90)), plan: fechaLima(addMin(AHORA, 20 * 24 * 60)) })
    const t6 = peorTienda(['ENTEL', 'CLARO']), c6 = momento(6)
    acciones.push({ tipo: 'PLAN_MEJORA', estado: 'PROPUESTO', tienda: t6, provAnt: null, provNvo: null, creado: c6, prop: addMin(c6, 60),
      titulo: `Plan de mejora de cableado en ${t6.codigo}`, motivo: 'Incidentes de intermitencia atribuidos a la red interna.', descripcion: 'Certificar el cableado y reemplazar los patch cords del gabinete.',
      plan: fechaLima(addMin(AHORA, 18 * 24 * 60)) })
    // BORRADOR ×2
    const t7 = peorTienda(['CONVERGIA']), c7 = momento(4)
    acciones.push({ tipo: 'CAMBIO_CONTRATO', estado: 'BORRADOR', tienda: t7, provAnt: 'CONVERGIA', provNvo: 'MOVISTAR', creado: c7,
      titulo: `Cambio de CONVERGIA a MOVISTAR en ${t7.codigo}`, motivo: 'Evaluar alternativa a Convergia por tiempos de atención.', descripcion: 'Pendiente cotización de Movistar.',
      plan: fechaLima(addMin(AHORA, 40 * 24 * 60)) })
    const t8 = peorTienda(['MOVISTAR', 'CLARO']), c8 = momento(2)
    acciones.push({ tipo: 'AUDITORIA_PROVEEDOR', estado: 'BORRADOR', tienda: t8, provAnt: t8.prov, provNvo: null, creado: c8,
      titulo: `Auditoría de SLA ${t8.prov} en ${t8.codigo}`, motivo: 'Validar las penalidades aplicables del último trimestre.', descripcion: 'Cruzar los tickets del proveedor con los incidentes de NetDesk.',
      plan: fechaLima(addMin(AHORA, 30 * 24 * 60)) })
    // RECHAZADO (BAJA) y CANCELADO (PLAN_MEJORA)
    const t9 = peorTienda(['ENTEL', 'BITEL']), c9 = momento(33)
    acciones.push({ tipo: 'BAJA_CONTRATO', estado: 'RECHAZADO', tienda: t9, provAnt: t9.prov, provNvo: null, creado: c9, prop: addMin(c9, 120), cierre: momento(28),
      titulo: `Baja del enlace ${t9.prov} en ${t9.codigo}`, motivo: 'Propuesta de dejar la tienda solo con contingencia 4G.', descripcion: 'Dar de baja el contrato y operar con router 4G.',
      rechazo: 'La tienda sigue operando con alto volumen de ventas; no es viable quedarse solo con 4G.', plan: fechaLima(addMin(diaLima(20), 0)) })
    const t10 = peorTienda(['CLARO', 'ENTEL']), c10 = momento(40)
    acciones.push({ tipo: 'PLAN_MEJORA', estado: 'CANCELADO', tienda: t10, provAnt: null, provNvo: null, creado: c10, prop: addMin(c10, 90), aprob: momento(36), cierre: momento(30),
      titulo: `Instalación de UPS para red en ${t10.codigo}`, motivo: 'Cortes eléctricos frecuentes en el mall.', descripcion: 'Comprar e instalar un UPS de 1 kVA para el gabinete.',
      notasAprob: 'Aprobado sujeto a presupuesto.', rechazo: 'El mall instalará un grupo electrógeno; el UPS ya no es necesario.', plan: fechaLima(addMin(diaLima(25), 0)) })
  }
  acciones.sort((a, b) => a.creado.getTime() - b.creado.getTime())
  const accionesRows: Row[] = acciones.map((a, k) => {
    const codigo = `AC-${String(k + 1).padStart(3, '0')}`
    if (a.idxEjec != null) for (const h of historial) if (h.valorNuevo?.endsWith(`__AC${a.idxEjec}__`)) h.valorNuevo = h.valorNuevo.replace(`__AC${a.idxEjec}__`, `${codigo}: ${a.titulo}`)
    return {
      id: randomUUID(), codigo, tipo: a.tipo, estado: a.estado, alcance: 'TIENDA', titulo: a.titulo, descripcion: a.descripcion, motivo: a.motivo,
      zonaDescripcion: null, tiendaId: a.tienda.id,
      proveedorAnteriorId: a.provAnt ? provId[a.provAnt] : null, proveedorNuevoId: a.provNvo ? provId[a.provNvo] : null,
      fichaAnteriorId: a.estado === 'COMPLETADO' ? a.fichaAnt ?? null : null, fichaNuevaId: a.fichaNueva?.id ?? null, routerExternoId: null,
      creadoPorId: pick(supervisores).id,
      aprobadoPorId: a.aprob ? supervisores[1].id : null, ejecutadoPorId: a.ejec ? supervisores[0].id : null,
      creadoEn: a.creado,
      actualizadoEn: a.evalAt ?? a.ejec ?? a.cierre ?? a.aprob ?? a.prop ?? a.creado,
      fechaEjecucionPlanificada: a.ejec ? fechaLima(a.ejec) : a.plan ?? null,
      aprobadoEn: a.aprob ?? null, notasAprobacion: a.notasAprob ?? null, rechazadoMotivo: a.rechazo ?? null,
      ejecutadoEn: a.ejec ?? null, notasEjecucion: a.notasEjec ?? null,
      fechaEval30: a.ejec ? fechaLima(addMin(a.ejec, 30 * 24 * 60)) : null,
      fechaEval90: a.ejec ? fechaLima(addMin(a.ejec, 90 * 24 * 60)) : null,
      snapPeriodoDias: 90, eval30Completada: false, eval90Completada: false,
      _def: a,
    }
  })

  // Perfil de la tienda según su reincidencia (antes de auditar ediciones: es un campo editable).
  for (const t of tiendas) {
    const n = nIncTienda.get(t.id) ?? 0
    t.perfilSupervisor = n >= 5 ? 'rojo' : n >= 3 ? 'amarillo' : 'verde'
  }

  // ═══ Ediciones manuales de tiendas (2–3 por tienda) ════════════════════════
  const CAMPOS: [string, (t: TiendaGen) => string | null][] = [
    ['administradorNombre', () => `${pick(TX.NOMBRES)} ${pick(TX.APELLIDOS)}`],
    ['administradorCelular', () => celular()],
    ['celularTienda', () => celular()],
    ['anydeskId', () => `${digitos(3)} ${digitos(3)} ${digitos(3)}`],
    ['supervisorCelular', () => celular()],
    ['instruccionReporte', () => 'Llamar a la tienda antes de escalar.'],
    ['perfilSupervisor', t => (t.perfilSupervisor === 'verde' ? 'amarillo' : 'verde')],
    ['gabinete', t => String(!t.gabinete)],
    ['contingenciaPaquete', () => pick(['20 GB', '30 GB'])],
  ]
  for (const t of tiendas) {
    const n = ri(2, 3)
    const campos = shuffle(CAMPOS.filter(([c]) => c !== 'contingenciaPaquete' || t.tieneContingencia)).slice(0, n)
    for (const [campo, anterior] of campos) {
      const actual = campo === 'gabinete' ? String(t.gabinete) : (t[campo] ?? null)
      const nuevo = actual == null || actual === '' ? null : String(actual)
      const viejo = anterior(t)
      if (viejo === nuevo) continue
      historial.push({ id: randomUUID(), tiendaId: t.id, usuarioId: pick([...supervisores, ...agentes.slice(0, 2)]).id, campoEditado: campo,
        valorAnterior: viejo, valorNuevo: nuevo,
        editadoEn: conSeg(addMin(diaLima(ri(1, 89)), ri(9 * 60, 19 * 60))), motivo: '' })
    }
    // Actualización de ventas para algunas tiendas con venta (la PUT recalcula y audita las 3).
    if (!t.nueva && chance(0.12)) {
      const ed = conSeg(addMin(diaLima(ri(30, 85)), ri(9 * 60, 18 * 60)))
      const prev = Math.round(Number(t.ventaMensualSoles) * ru(0.85, 0.97) / 10) * 10
      const sem = prev * 7 / 30.44, pr = Number(t.proporcionFds)
      const u = pick(supervisores).id
      historial.push(
        { id: randomUUID(), tiendaId: t.id, usuarioId: u, campoEditado: 'ventaMensualSoles', valorAnterior: prev.toFixed(2), valorNuevo: t.ventaMensualSoles, editadoEn: ed, motivo: '' },
        { id: randomUUID(), tiendaId: t.id, usuarioId: u, campoEditado: 'ventaHoraSoles', valorAnterior: ((sem * (1 - pr)) / 48).toFixed(2), valorNuevo: t.ventaHoraSoles, editadoEn: ed, motivo: '' },
        { id: randomUUID(), tiendaId: t.id, usuarioId: u, campoEditado: 'ventaHoraFdsSoles', valorAnterior: ((sem * pr) / 36).toFixed(2), valorNuevo: t.ventaHoraFdsSoles, editadoEn: ed, motivo: '' },
      )
    }
  }

  // Contingencia activa según tramos de router abiertos; proveedor y ficha vigentes.
  for (const t of tiendas) {
    const abiertoRouter = tramos.some(tr => !tr.hasta && (tr.tipo === 'ROUTER_PROPIO' || tr.tipo === 'ROUTER_EXTERNO') && incidentes.find(i => i.id === tr.incidenteId)!.tiendaId === t.id)
    t.contingenciaActiva = abiertoRouter
    t.proveedorId = provId[t.historiaProv[t.historiaProv.length - 1].prov]
    t.fichaActivaId = t.historiaProv[t.historiaProv.length - 1].fichaId
  }
  // Códigos de ficha: FC-NNN-Tnn, globales por orden de creación.
  fichas.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime())
    .forEach((f, k) => { f.codigo = `FC-${String(k + 1).padStart(3, '0')}-${tiendas.find(t => t.id === f.tiendaId)!.codigo}` })

  if (process.env.SEED_DRY) {
    const resp: Record<string, number[]> = {}
    for (const i of incidentes) if (i._primeraResp && i._escs.length) {
      const p = (Object.keys(provId) as Prov[]).find(k => provId[k] === i.proveedorId)!
      ;(resp[p] ??= []).push(minEntre(i._escs[0].horaEnvioCorreo, i._primeraResp))
    }
    const escal = incidentes.filter(i => i._escs.length).length
    const conResp = incidentes.filter(i => i._primeraResp).length
    const horario = incidentes.filter(i => { const h = lima(i._creado).h; return h >= 8 && h < 22 }).length
    console.log(JSON.stringify({
      semilla: SEMILLA, escal, conResp, horario, mitigados: tramos.filter(t => t.tipo !== 'SIN_MITIGACION').reduce((s, t) => s.add(t.incidenteId), new Set()).size,
      resp: Object.fromEntries(Object.entries(resp).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)])),
    }))
    return
  }

  // ═══ Escritura (una sola transacción) ══════════════════════════════════════
  const limpio = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith('_') && v !== undefined))
  const tiendaCols = ['id', 'codigo', 'nombreCc', 'formato', 'direccion', 'referencia', 'distrito', 'provincia', 'ubicacion', 'coordenadas', 'cluster',
    'supervisorNombre', 'proveedorId', 'tieneContingencia', 'instruccionReporte', 'contactoSoporte', 'anydeskId', 'administradorNombre',
    'administradorEmail', 'administradorCelular', 'perfilSupervisor', 'ventaHoraSoles', 'ventaHoraFdsSoles', 'ventaMensualSoles', 'proporcionFds',
    'contingenciaActiva', 'contingenciaDescripcion', 'celularTienda', 'supervisorCelular', 'contingenciaChip', 'contingenciaPaquete',
    'gabinete', 'observacion', 'tipoLocal', 'creadoEn', 'estado']
  const tiendaRow = (t: TiendaGen) => Object.fromEntries(tiendaCols.map(c => [c, t[c] ?? null]))
  const enLotes = async (tx: any, tabla: any, filas: Row[], n = 200) => {
    for (let k = 0; k < filas.length; k += n) await tx.insert(tabla).values(filas.slice(k, k + n).map(limpio))
  }

  const FIXTURE_TABLAS = [
    ['usuarios', `SELECT * FROM usuarios WHERE email = 'agente-test@netdesk-test.local'`],
    ['proveedores', `SELECT * FROM proveedores WHERE nombre = 'BITEL TEST'`],
    ['tiendas', `SELECT * FROM tiendas WHERE codigo = 'T-TEST01'`],
    ['fichas', `SELECT * FROM fichas WHERE tienda_id IN (SELECT id FROM tiendas WHERE codigo = 'T-TEST01')`],
    ['fichas_niveles', `SELECT * FROM fichas_niveles WHERE ficha_id IN (SELECT f.id FROM fichas f JOIN tiendas t ON t.id = f.tienda_id WHERE t.codigo = 'T-TEST01')`],
    ['incidentes', `SELECT * FROM incidentes WHERE codigo ~ '^TST-P[123]-'`],
    ['incidente_mitigacion_tramos', `SELECT * FROM incidente_mitigacion_tramos WHERE incidente_id IN (SELECT id FROM incidentes WHERE codigo ~ '^TST-P[123]-')`],
    ['escalamientos', `SELECT * FROM escalamientos WHERE incidente_id IN (SELECT id FROM incidentes WHERE codigo ~ '^TST-P[123]-')`],
    ['atc_llamadas', `SELECT * FROM atc_llamadas WHERE escalamiento_id IN (SELECT e.id FROM escalamientos e JOIN incidentes i ON i.id = e.incidente_id WHERE i.codigo ~ '^TST-P[123]-')`],
  ] as const
  const TODAS = ['usuarios', 'proveedores', 'tiendas', 'fichas', 'fichas_niveles', 'proveedores_niveles', 'tiendas_historial', 'incidentes',
    'incidente_mitigacion_tramos', 'incidente_mitigacion_tramos_historial', 'routers_externos', 'router_historial', 'grupos_masivos',
    'escalamientos', 'sla_alertas', 'password_cambios', 'atc_llamadas', 'adjuntos', 'contingencias', 'acciones_gestion', 'acciones_gestion_tiendas']

  await db.transaction(async tx => {
    // 1. Copia del fixture de tests (se reinserta idéntico al final).
    const fixture: Record<string, any[]> = {}
    for (const [tabla, q] of FIXTURE_TABLAS) fixture[tabla] = (await tx.execute(sql.raw(`SELECT COALESCE(json_agg(x), '[]'::json) AS j FROM (${q}) x`)) as any)[0].j
    log('fixture copiado:', Object.entries(fixture).map(([t, r]) => `${t}=${r.length}`).join(' '))

    // 2. Borrado total.
    await tx.execute(sql.raw(`TRUNCATE ${TODAS.join(', ')} CASCADE`))

    // 3. Seed.
    await enLotes(tx, S.usuarios, usuarios)
    await enLotes(tx, S.proveedores, proveedores)
    await enLotes(tx, S.proveedoresNiveles, provNiveles)
    await enLotes(tx, S.tiendas, tiendas.map(t => ({ ...tiendaRow(t), fichaActivaId: null })))
    await enLotes(tx, S.fichas, fichas)
    await enLotes(tx, S.fichasNiveles, fichaNiveles)
    for (const t of tiendas) await tx.update(S.tiendas).set({ fichaActivaId: t.fichaActivaId }).where(eq(S.tiendas.id, t.id))
    await enLotes(tx, S.routersExternos, routers)
    await enLotes(tx, S.routerHistorial, routerHist)
    await enLotes(tx, S.gruposMasivos, gruposCreados)
    await enLotes(tx, S.incidentes, incidentes, 100)
    await enLotes(tx, S.incidenteMitigacionTramos, tramos)
    await enLotes(tx, S.escalamientos, escalamientos)
    await enLotes(tx, S.atcLlamadas, atc)
    await enLotes(tx, S.slaAlertas, alertas)
    await enLotes(tx, S.tiendasHistorial, historial)
    await enLotes(tx, S.accionesGestion, accionesRows)
    await tx.execute(sql.raw(`SELECT setval('netdesk_inc_seq', ${ultimoSeq})`))

    // 4. Fixture de tests, tal cual estaba.
    const reponer = async (tabla: string, filas: any[]) => {
      if (!filas.length) return
      await tx.execute(sql`INSERT INTO ${sql.identifier(tabla)} SELECT * FROM json_populate_recordset(NULL::${sql.identifier(tabla)}, ${JSON.stringify(filas)}::json)`)
    }
    await reponer('usuarios', fixture.usuarios)
    await reponer('proveedores', fixture.proveedores)
    await reponer('tiendas', fixture.tiendas.map((t: any) => ({ ...t, ficha_activa_id: null })))
    await reponer('fichas', fixture.fichas)
    for (const t of fixture.tiendas) await tx.execute(sql`UPDATE tiendas SET ficha_activa_id = ${t.ficha_activa_id} WHERE id = ${t.id}`)
    for (const tabla of ['fichas_niveles', 'incidentes', 'incidente_mitigacion_tramos', 'escalamientos', 'atc_llamadas']) await reponer(tabla, fixture[tabla])
  })
  log('fase 1 OK (commit)')
  await client.end()

  // ═══ Fase 2: snapshots y evaluación 30 días con calcMetrics ════════════════
  const { calcMetrics } = await import('../app/api/gestion-cambios/[id]/evaluar/route')
  const { db: appDb } = await import('../lib/db')
  for (const a of accionesRows) {
    const def: AccDef = a._def
    const t = def.tienda
    const hp = provEn(t, def.creado)
    const f = fichas.find(x => x.id === hp.fichaId)!
    const desde = addMin(def.creado, -90 * 24 * 60)
    const m = await calcMetrics([t.id], desde, def.creado)
    const snap = {
      tiendaCodigo: t.codigo, tiendaNombre: t.nombreCc, tiendaDistrito: t.distrito,
      proveedorId: provId[hp.prov], proveedorNombre: hp.prov, contratoPlan: f.plan,
      contratoSlaRespuestaMin: f.tiempoRespuestaSla, contratoSlaResolucionMin: f.tiempoResolucionSla,
      periodoEvaluado: 'Últimos 90 días', fechaDesde: desde.toISOString().slice(0, 10), fechaHasta: def.creado.toISOString().slice(0, 10),
      ...m,
    }
    const set: Row = {
      snapSlaPct: String(m.slaRespuestaPct), snapMttrMin: m.mttrMin, snapIei: String(m.ieiAcumulado),
      snapNincidentes: m.totalIncidentes, snapDetalle: snap,
    }
    if (def.estado === 'COMPLETADO') {
      const e = await calcMetrics([t.id], def.ejec!, addMin(def.ejec!, 30 * 24 * 60))
      // La nota la escribe quien evalúa mirando los números: que diga lo que muestran.
      const mejoro = e.totalIncidentes < m.totalIncidentes || (e.totalIncidentes === m.totalIncidentes && e.ieiAcumulado < m.ieiAcumulado)
      const nota = mejoro
        ? `${def.evalNota} Incidentes: ${m.totalIncidentes} antes → ${e.totalIncidentes} en los primeros 30 días.`
        : `Sin mejora clara en los primeros 30 días (${m.totalIncidentes} incidentes antes, ${e.totalIncidentes} después). Se revisa de nuevo a los 90 días.`
      Object.assign(set, {
        eval30Completada: true, eval30Fecha: def.evalAt, eval30SlaPct: String(e.slaRespuestaPct), eval30MttrMin: e.mttrMin,
        eval30Iei: String(e.ieiAcumulado), eval30Nincidentes: e.totalIncidentes, eval30Detalle: e, eval30Nota: nota,
        eval30Metodo: e.metodo, penalidadEstimada: String(e.penalidadEstimada),
      })
    }
    await appDb.update(S.accionesGestion).set(set).where(eq(S.accionesGestion.id, a.id))
  }
  log('fase 2 OK (snapshots y evaluaciones)')

  // ═══ Verificación ══════════════════════════════════════════════════════════
  const q = async (s: string) => (await appDb.execute(sql.raw(s))) as any[]
  console.log('\n── Conteos por tabla ──')
  for (const t of TODAS) console.log(`  ${t.padEnd(40)} ${(await q(`SELECT count(*)::int n FROM ${t}`))[0].n}`)
  const SEED = `i.codigo !~ '^TST-'`
  console.log('\n── Incidentes del seed ──')
  console.log('  estado:', (await q(`SELECT estado, count(*)::int n FROM incidentes i WHERE ${SEED} GROUP BY 1 ORDER BY 2 DESC`)).map(r => `${r.estado}=${r.n}`).join(' '))
  console.log('  tipo:  ', (await q(`SELECT tipo, count(*)::int n FROM incidentes i WHERE ${SEED} GROUP BY 1 ORDER BY 2 DESC`)).map(r => `${r.tipo}=${r.n}`).join(' '))
  console.log('  impacto:', (await q(`SELECT nivel_impacto, count(*)::int n FROM incidentes i WHERE ${SEED} GROUP BY 1 ORDER BY 2 DESC`)).map(r => `${r.nivel_impacto}=${r.n}`).join(' '))
  console.log('  reabiertos:', (await q(`SELECT count(*)::int n FROM incidentes i WHERE ${SEED} AND hora_registro_original IS NOT NULL`))[0].n)
  console.log('  escalados:', (await q(`SELECT count(DISTINCT incidente_id)::int n FROM escalamientos e JOIN incidentes i ON i.id = e.incidente_id WHERE ${SEED}`))[0].n)
  console.log('  escalados con respuesta del proveedor:', (await q(`SELECT count(DISTINCT incidente_id)::int n FROM escalamientos e JOIN incidentes i ON i.id = e.incidente_id WHERE ${SEED} AND e.hora_respuesta IS NOT NULL`))[0].n)
  console.log('  con descartes (sin cortes eléctricos):', (await q(`SELECT count(*) FILTER (WHERE desc_energia IS NOT NULL OR desc_router IS NOT NULL OR check_ipconfig OR check_ping_gw)::int n, count(*)::int total FROM incidentes i WHERE ${SEED} AND tipo <> 'CORTE_ELECTRICO'`)).map(r => `${r.n}/${r.total}`)[0])
  console.log('  con mitigación:', (await q(`SELECT count(DISTINCT incidente_id)::int n FROM incidente_mitigacion_tramos tr JOIN incidentes i ON i.id = tr.incidente_id WHERE ${SEED} AND tr.tipo <> 'SIN_MITIGACION'`))[0].n)
  console.log('  horario 8–22 Lima:', (await q(`SELECT round(100.0 * avg(CASE WHEN extract(hour FROM COALESCE(hora_registro_original, hora_registro) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') BETWEEN 8 AND 21 THEN 1 ELSE 0 END), 1) p FROM incidentes i WHERE ${SEED}`))[0].p + '%')
  console.log('\n── Respuesta del proveedor (min desde el primer correo) ──')
  for (const r of await q(`
    SELECT p.nombre, count(*)::int n, round(avg(x.t))::int prom, min(x.t)::int mn, max(x.t)::int mx FROM (
      SELECT i.proveedor_id, EXTRACT(EPOCH FROM (min(e.hora_respuesta) - min(e.hora_envio_correo))) / 60 t
      FROM incidentes i JOIN escalamientos e ON e.incidente_id = i.id WHERE ${SEED} GROUP BY i.id, i.proveedor_id
    ) x JOIN proveedores p ON p.id = x.proveedor_id WHERE x.t IS NOT NULL GROUP BY 1 ORDER BY 3`)) console.log(`  ${r.nombre.padEnd(10)} n=${r.n} prom=${r.prom} min=${r.mn} max=${r.mx}`)

  // Tramos: sin huecos, sin solapes, dentro del incidente, IEI = calcIeiIncidente.
  const incs = await q(`SELECT i.*, t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster FROM incidentes i JOIN tiendas t ON t.id = i.tienda_id WHERE ${SEED}`)
  const trs = await q(`SELECT tr.* FROM incidente_mitigacion_tramos tr JOIN incidentes i ON i.id = tr.incidente_id WHERE ${SEED} ORDER BY tr.desde`)
  const porInc = new Map<string, any[]>()
  for (const tr of trs) { if (!porInc.has(tr.incidente_id)) porInc.set(tr.incidente_id, []); porInc.get(tr.incidente_id)!.push(tr) }
  // El driver devuelve los timestamp naive como texto: son instantes UTC.
  const U = (v: any): Date | null => (v == null ? null : new Date(String(v).replace(' ', 'T') + 'Z'))
  const ms = (v: any) => U(v)?.getTime() ?? null
  let errores = 0, ieiTotal = 0
  for (const i of incs) {
    const ts = porInc.get(i.id) ?? []
    if (!ts.length) { errores++; console.log('  sin tramos:', i.codigo); continue }
    if (ms(ts[0].desde) !== ms(i.hora_registro)) { errores++; console.log('  tramo no arranca en hora_registro:', i.codigo) }
    for (let k = 1; k < ts.length; k++) if (ms(ts[k].desde) !== ms(ts[k - 1].hasta)) { errores++; console.log('  hueco/solape:', i.codigo) }
    for (const tr of ts) if (tr.hasta && ms(tr.hasta)! < ms(tr.desde)!) { errores++; console.log('  desde > hasta:', i.codigo) }
    const last = ts[ts.length - 1]
    if (ms(last.hasta) !== ms(i.hora_fin)) { errores++; console.log('  último tramo no cierra en hora_fin:', i.codigo) }
    for (const tr of ts.filter(x => x.hasta)) {
      const ie = calcIeTramo({ tipo: tr.tipo, factor: tr.factor, desde: U(tr.desde)!, hasta: U(tr.hasta), tipoIncidente: i.tipo }, { ventaHoraSoles: i.venta_hora_soles, ventaHoraFdsSoles: i.venta_hora_fds_soles }, U(tr.hasta)!)
      if (ie !== Number(tr.ie_tramo)) { errores++; console.log('  ie_tramo distinto de calcIeTramo:', i.codigo) }
    }
    const { iei } = calcIeiIncidente(
      { tipo: i.tipo, estado: i.estado, horaRegistro: U(i.hora_registro)!, horaFin: U(i.hora_fin), ieiAcumulado: i.iei_acumulado },
      ts.map(x => ({ tipo: x.tipo, factor: x.factor, desde: U(x.desde)!, hasta: U(x.hasta), ieTramo: x.ie_tramo })),
      { ventaHoraSoles: i.venta_hora_soles, ventaHoraFdsSoles: i.venta_hora_fds_soles, cluster: i.cluster }, AHORA)
    ieiTotal += iei
  }
  console.log(`\n── Tramos e IEI ── errores de consistencia: ${errores} · IEI total (calcIeiIncidente): S/ ${ieiTotal.toLocaleString('es-PE')}`)
  const fk = await q(`
    SELECT
      (SELECT count(*) FROM incidentes i LEFT JOIN fichas f ON f.id = i.ficha_id WHERE i.ficha_id IS NOT NULL AND f.id IS NULL)::int AS inc_ficha,
      (SELECT count(*) FROM tiendas WHERE ficha_activa_id IS NULL)::int AS tienda_sin_ficha,
      (SELECT count(*) FROM (SELECT tienda_id FROM fichas WHERE estado = 'ACTIVA' GROUP BY 1 HAVING count(*) > 1) x)::int AS tienda_2_activas,
      (SELECT count(*) FROM escalamientos e JOIN incidentes i ON i.id = e.incidente_id JOIN fichas_niveles n ON n.id = e.ficha_nivel_id WHERE n.ficha_id <> i.ficha_id)::int AS nivel_otra_ficha`)
  console.log('── Integridad ──', fk[0])

  await (appDb as any).$client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
