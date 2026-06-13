// Helpers de estilo y formato compartidos por el detalle de incidente y sus
// sub-paneles (GrupoMasivoPanel, EscalamientoCard, InfraEscalamientoPanel).
import type { CSSProperties } from 'react'

export function iStyle(dis?: boolean): CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: dis ? 'var(--muted)' : 'var(--card)', color: dis ? 'var(--muted-foreground)' : 'var(--foreground)', outline: 'none' }
}
export function taStyle(dis?: boolean): CSSProperties {
  return { ...iStyle(dis), minHeight: '72px', resize: 'vertical' as const, fontFamily: 'inherit' }
}

export function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const lima = new Date(new Date(iso).getTime() - 5 * 3600000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${lima.getUTCFullYear()}-${p(lima.getUTCMonth()+1)}-${p(lima.getUTCDate())}T${p(lima.getUTCHours())}:${p(lima.getUTCMinutes())}`
}
export function fromDatetimeLocal(val: string) {
  if (!val) return null
  return new Date(val + ':00-05:00').toISOString()
}
export function minToHM(min: number | null) {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  CORTE_ELECTRICO: '⚡ Corte eléctrico',
}

function buildDescartes(inc: any): string {
  const parts: string[] = []
  if (inc.descEnergia === true)  parts.push('Energía verificada: OK')
  if (inc.descEnergia === false) parts.push('Energía verificada: Falla')
  if (inc.descRouter  === true)  parts.push('Router/ONT verificado: OK')
  if (inc.descRouter  === false) parts.push('Router/ONT verificado: Falla')
  if (inc.descDns     === true)  parts.push('Cambio DNS aplicado: OK')
  if (inc.descDns     === false) parts.push('Cambio DNS aplicado: Falla')
  if (inc.checkIpconfig)     parts.push('Ipconfig ejecutado')
  if (inc.checkPingGw)       parts.push('Ping a gateway')
  if (inc.checkPingInternet) parts.push('Ping a internet')
  if (inc.checkTracert)      parts.push('Tracert ejecutado')
  if (inc.checkDns)          parts.push('Validó DNS')
  if (inc.checkRenovarIp)    parts.push('Renovó IP')
  if (inc.descartesDetallado) parts.push(inc.descartesDetallado)
  else if (inc.descartesRealizados) parts.push(inc.descartesRealizados)
  return parts.length > 0 ? parts.join('\n') : 'Pendiente de documentar'
}

export function buildCorreo(inc: any, nivelData: any, nivel: number = 1, prevEscs: any[] = []) {
  const fmtH = (d: string | null | undefined) => d
    ? new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
  const prefix = nivel === 2
    ? `El presente correo es una escalación debido a que no obtuvimos respuesta al correo enviado el ${fmtH(prevEscs[0]?.horaEnvioCorreo)}. Se requiere atención inmediata.\n\n`
    : nivel === 3
    ? `Tercer escalamiento. Los correos anteriores (N1: ${fmtH(prevEscs[0]?.horaEnvioCorreo)}, N2: ${fmtH(prevEscs[1]?.horaEnvioCorreo)}) no recibieron respuesta. Exigimos atención urgente y solución en el menor tiempo posible.\n\n`
    : nivel === 4
    ? `Cuarto y último escalamiento. Situación crítica sin resolución. Solicitamos intervención de nivel gerencial.\n\n`
    : ''
  return `${prefix}Asunto: [NetDesk ${inc.codigo}] Avería Internet — ${inc.tiendaCodigo} ${inc.tiendaNombre} · ${inc.tiendaDistrito}

Estimados ${nivelData?.nombreContacto ?? 'Soporte'},

Reportamos avería en la tienda ${inc.tiendaCodigo} — ${inc.tiendaNombre}
Dirección: ${inc.tiendaDireccion ?? '—'}
Proveedor: ${inc.proveedorNombre ?? '—'}
CID / Servicio: ${inc.tiendaCid ?? '—'}
Tipo de conexión: ${inc.tiendaTipoConexion ?? '—'}

Tipo de falla: ${TIPO_LABELS[inc.tipo] ?? inc.tipo}
Hora de inicio: ${new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
Usuarios afectados: ${inc.usuariosAfectados ?? '—'}

Descartes realizados:
${buildDescartes(inc)}

Adjuntamos evidencias.
Quedamos atentos a su respuesta.

Service Desk — Footloose Perú
Ticket NetDesk: ${inc.codigo}
RUC: 20427799973`
}
