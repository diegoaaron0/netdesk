// Armado del correo de escalamiento a proveedor: asunto, cáscara HTML con
// branding y validación de adjuntos. Todo puro — la ruta se limita a leer de
// la BD, llamar acá y despachar por lib/mailer.
//
// Criterio de diseño del HTML: fondo CLARO. El tema oscuro de la app no
// sobrevive a Outlook de escritorio (motor de Word): ignora los fondos de
// <div>, así que el texto claro termina en blanco sobre blanco. Todo va en
// tablas con estilos inline, sin gradientes CSS (Word tampoco los soporta):
// la franja de marca se arma con tres celdas de color sólido.

export const MAX_ADJUNTOS      = 3
export const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024   // 5 MB c/u; O365 corta en 25 MB totales
export const TIPOS_ADJUNTO     = ['image/jpeg', 'image/png', 'image/webp']

export const LOGO_CID = 'netdesk-logo'

export type AdjuntoEntrada = { nombre?: string; tipo?: string; dataUrl?: string }

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** "Incidente 00071M — T20 Plaza Norte — Nivel 2" */
export function asuntoEscalamiento({ codigo, tiendaCodigo, tiendaNombre, nivel }: {
  codigo: string
  tiendaCodigo?: string | null
  tiendaNombre?: string | null
  nivel: number
}): string {
  const tienda = [tiendaCodigo, tiendaNombre].filter(Boolean).join(' ') || 'Tienda'
  return `Incidente ${codigo} — ${tienda} — Nivel ${nivel}`
}

/** La plantilla de buildCorreo() arranca con una línea "Asunto: ...". Ese texto
 *  ya viaja en la cabecera SMTP, así que se saca del cuerpo para que el
 *  proveedor no lo vea dos veces. */
export function quitarAsuntoDelCuerpo(texto: string): string {
  return texto.replace(/^\s*Asunto:.*(\r?\n)+/i, '')
}

type Bloque =
  | { tipo: 'campos';  filas: Array<[string, string]> }
  | { tipo: 'titulo';  texto: string }
  | { tipo: 'parrafo'; texto: string }

const RE_CAMPO = /^([^:]{2,40}):[ \t]*(.*)$/

/** Convierte el texto plano que editó el agente en bloques estructurados: las
 *  líneas "Etiqueta: valor" se agrupan en tablas y el resto queda como prosa.
 *  Ninguna línea se descarta — lo que no matchea sale como párrafo. */
export function parsearCuerpo(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  let campos: Array<[string, string]> = []
  // Una línea en blanco separa párrafos: sin esto, "Estimados X," y el párrafo
  // siguiente se fusionaban en uno solo.
  let parrafoAbierto = false
  const cerrarCampos = () => {
    if (campos.length > 0) { bloques.push({ tipo: 'campos', filas: campos }); campos = [] }
  }

  for (const linea of quitarAsuntoDelCuerpo(texto).split(/\r?\n/)) {
    const l = linea.trim()
    if (!l) { cerrarCampos(); parrafoAbierto = false; continue }
    const m = RE_CAMPO.exec(l)
    if (m && m[2].trim()) {
      campos.push([m[1].trim(), m[2].trim()])
      parrafoAbierto = false
    } else if (m) {
      // "Descartes realizados:" — etiqueta sin valor, es un encabezado.
      cerrarCampos()
      bloques.push({ tipo: 'titulo', texto: m[1].trim() })
      parrafoAbierto = false
    } else {
      cerrarCampos()
      const ult = bloques[bloques.length - 1]
      if (parrafoAbierto && ult?.tipo === 'parrafo') ult.texto += '\n' + l
      else { bloques.push({ tipo: 'parrafo', texto: l }); parrafoAbierto = true }
    }
  }
  cerrarCampos()
  return bloques
}

const C = {
  fondo:    '#f4f6fb',
  tarjeta:  '#ffffff',
  navy:     '#0d1430',
  texto:    '#1c2340',
  suave:    '#5b6796',
  borde:    '#e6e9f5',
  teal:     '#00b4d8',
  azul:     '#3b82f6',
  purpura:  '#7c5cf5',
}

function bloquesAHtml(bloques: Bloque[]): string {
  return bloques.map(b => {
    if (b.tipo === 'titulo') {
      return `<tr><td style="padding:16px 0 6px;font:600 12px/1.4 Segoe UI,Arial,sans-serif;color:${C.suave};text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(b.texto)}</td></tr>`
    }
    if (b.tipo === 'parrafo') {
      return `<tr><td style="padding:6px 0;font:400 14px/1.6 Segoe UI,Arial,sans-serif;color:${C.texto};">${escapeHtml(b.texto).replace(/\n/g, '<br>')}</td></tr>`
    }
    const filas = b.filas.map(([k, v], i) => `
            <tr>
              <td style="padding:9px 12px;border-top:${i === 0 ? '0' : `1px solid ${C.borde}`};font:600 13px/1.4 Segoe UI,Arial,sans-serif;color:${C.suave};white-space:nowrap;vertical-align:top;width:38%;">${escapeHtml(k)}</td>
              <td style="padding:9px 12px;border-top:${i === 0 ? '0' : `1px solid ${C.borde}`};font:400 13px/1.4 Segoe UI,Arial,sans-serif;color:${C.texto};">${escapeHtml(v)}</td>
            </tr>`).join('')
    return `<tr><td style="padding:8px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.borde};border-radius:8px;background:#fbfcff;">${filas}
          </table>
        </td></tr>`
  }).join('')
}

/** Cáscara con branding alrededor del texto que escribió el agente. El logo se
 *  referencia por CID (va adjunto al propio correo): Outlook y Gmail bloquean
 *  las imágenes remotas hasta que el destinatario las habilita, y los data:
 *  URI directamente no los renderizan. */
export function htmlEscalamiento({ cuerpo, codigo, nivel, ahora = new Date() }: {
  cuerpo: string
  codigo: string
  nivel: number
  ahora?: Date
}): string {
  const fecha = ahora.toLocaleString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const franja = [C.purpura, C.azul, C.teal]
    .map(c => `<td width="33.33%" height="4" style="background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Incidente ${escapeHtml(codigo)} — Nivel ${nivel}</title></head>
<body style="margin:0;padding:0;background:${C.fondo};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.tarjeta};border-radius:12px;overflow:hidden;border:1px solid ${C.borde};">

        <tr><td style="background:${C.navy};padding:20px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;padding-right:12px;">
              <img src="cid:${LOGO_CID}" width="52" height="36" alt="NetDesk" style="display:block;border:0;">
            </td>
            <td style="vertical-align:middle;font:700 22px/1 Segoe UI,Arial,sans-serif;color:#ffffff;letter-spacing:-.02em;">
              Net<span style="color:${C.teal};">Desk</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${franja}</tr></table></td></tr>

        <tr><td style="padding:22px 24px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font:700 11px/1 Segoe UI,Arial,sans-serif;color:#ffffff;background:${C.azul};padding:5px 10px;border-radius:999px;">NIVEL ${nivel}</td>
            <td style="padding-left:10px;font:600 15px/1 Segoe UI,Arial,sans-serif;color:${C.texto};">Incidente ${escapeHtml(codigo)}</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:4px 24px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${bloquesAHtml(parsearCuerpo(cuerpo))}
          </table>
        </td></tr>

        <tr><td style="background:#fafbff;border-top:1px solid ${C.borde};padding:14px 24px;font:400 11px/1.6 Segoe UI,Arial,sans-serif;color:${C.suave};">
          <strong style="color:${C.texto};">NetDesk</strong> — Monitoreo Footloose Perú<br>
          Correo generado el ${escapeHtml(fecha)} (hora de Lima). Este buzón no recibe respuestas automáticas.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

export type AdjuntoValidado = { filename: string; base64: string; contentType: string; bytes: number }

/** Bytes reales de una cadena base64, sin decodificarla. Este módulo también
 *  se importa desde el cliente, así que no puede tocar Buffer. */
export function bytesDeBase64(b64: string): number {
  const limpio = b64.replace(/\s/g, '')
  if (!limpio) return 0
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0
  return Math.floor(limpio.length * 3 / 4) - relleno
}

/** Valida los adjuntos que manda el front como data: URL.
 *  El límite se mide sobre los bytes YA decodificados: base64 infla ~33%, así
 *  que medir el string daría un tope real de ~3.75 MB en vez de 5. */
export function validarAdjuntos(adjuntos: AdjuntoEntrada[] | undefined | null):
  { ok: true; archivos: AdjuntoValidado[] } | { ok: false; error: string } {
  const lista = adjuntos ?? []
  if (lista.length === 0) return { ok: true, archivos: [] }
  if (lista.length > MAX_ADJUNTOS) {
    return { ok: false, error: `Máximo ${MAX_ADJUNTOS} adjuntos por correo (llegaron ${lista.length}).` }
  }

  const archivos: AdjuntoValidado[] = []
  for (const [i, a] of lista.entries()) {
    const nombre = (a?.nombre ?? '').trim() || `adjunto-${i + 1}`
    // [\s\S] en vez de . con flag /s: el target de TS es anterior a es2018.
    const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(a?.dataUrl ?? '')
    if (!m) return { ok: false, error: `"${nombre}" no es una imagen válida.` }

    const contentType = m[1].toLowerCase()
    if (!TIPOS_ADJUNTO.includes(contentType)) {
      return { ok: false, error: `"${nombre}" es ${contentType}. Solo se aceptan JPG, PNG o WebP.` }
    }

    const base64 = m[2].replace(/\s/g, '')
    const bytes  = bytesDeBase64(base64)
    if (bytes === 0) return { ok: false, error: `"${nombre}" llegó vacío.` }
    if (bytes > MAX_ADJUNTO_BYTES) {
      const mb = (bytes / 1024 / 1024).toFixed(1)
      return { ok: false, error: `"${nombre}" pesa ${mb} MB. El máximo por archivo es 5 MB.` }
    }
    archivos.push({ filename: nombre, base64, contentType, bytes })
  }
  return { ok: true, archivos }
}
