import { describe, it, expect } from 'vitest'
import {
  asuntoEscalamiento, quitarAsuntoDelCuerpo, parsearCuerpo, htmlEscalamiento,
  validarAdjuntos, bytesDeBase64, escapeHtml,
  MAX_ADJUNTOS, MAX_ADJUNTO_BYTES, LOGO_CID,
} from './correo-escalamiento'

const b64De = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64')
const imagen = (bytes: number, tipo = 'image/png') =>
  ({ nombre: 'captura.png', tipo, dataUrl: `data:${tipo};base64,${b64De(bytes)}` })

describe('asuntoEscalamiento', () => {
  it('arma "Incidente CODIGO — TIENDA — Nivel N"', () => {
    expect(asuntoEscalamiento({ codigo: '00071M', tiendaCodigo: 'T20', tiendaNombre: 'Plaza Norte', nivel: 2 }))
      .toBe('Incidente 00071M — T20 Plaza Norte — Nivel 2')
  })

  it('no deja el separador colgando cuando la tienda no tiene nombre de CC', () => {
    expect(asuntoEscalamiento({ codigo: '00071M', tiendaCodigo: 'T20', tiendaNombre: null, nivel: 1 }))
      .toBe('Incidente 00071M — T20 — Nivel 1')
  })
})

describe('quitarAsuntoDelCuerpo — el asunto ya viaja en la cabecera SMTP', () => {
  it('saca la primera línea "Asunto: ..." y las vacías que la siguen', () => {
    const texto = 'Asunto: [NetDesk 00071M] Avería Internet — T20\n\nEstimados Soporte,\n\nReportamos avería.'
    expect(quitarAsuntoDelCuerpo(texto)).toBe('Estimados Soporte,\n\nReportamos avería.')
  })

  it('no toca un cuerpo que no arranca con Asunto', () => {
    const texto = 'Estimados,\n\nAsunto de la reunión: pendiente.'
    expect(quitarAsuntoDelCuerpo(texto)).toBe(texto)
  })
})

describe('parsearCuerpo', () => {
  const plantilla = [
    'Estimados Soporte Bitel,',
    '',
    'Reportamos avería en la tienda T20 — Plaza Norte',
    'Dirección: Av. Alfredo Mendiola 1400',
    'Proveedor: BITEL',
    '',
    'Tipo de falla: Caída total',
    'Hora de inicio: 11/09/2026, 10:30:00',
    '',
    'Descartes realizados:',
    'Energía verificada: OK',
  ].join('\n')

  it('agrupa las líneas "Etiqueta: valor" en una tabla y deja la prosa como párrafo', () => {
    const bloques = parsearCuerpo(plantilla)
    expect(bloques[0]).toEqual({ tipo: 'parrafo', texto: 'Estimados Soporte Bitel,' })
    const campos = bloques.filter(b => b.tipo === 'campos')
    expect(campos[0]).toMatchObject({
      filas: [['Dirección', 'Av. Alfredo Mendiola 1400'], ['Proveedor', 'BITEL']],
    })
  })

  it('una etiqueta sin valor ("Descartes realizados:") es un título, no un campo vacío', () => {
    expect(parsearCuerpo(plantilla)).toContainEqual({ tipo: 'titulo', texto: 'Descartes realizados' })
  })

  it('parte el valor en el PRIMER ":" — una hora con minutos no rompe la fila', () => {
    const campos = parsearCuerpo('Hora de inicio: 11/09/2026, 10:30:00').find(b => b.tipo === 'campos')
    expect(campos).toMatchObject({ filas: [['Hora de inicio', '11/09/2026, 10:30:00']] })
  })

  it('no pierde ninguna línea: todo el texto del agente sale en algún bloque', () => {
    const bloques = parsearCuerpo(plantilla)
    const rendido = bloques.flatMap(b =>
      b.tipo === 'campos' ? b.filas.flat() : [b.texto]).join(' ')
    for (const linea of plantilla.split('\n').filter(l => l.trim())) {
      for (const parte of linea.split(':').map(s => s.trim()).filter(Boolean)) {
        expect(rendido).toContain(parte)
      }
    }
  })
})

describe('htmlEscalamiento', () => {
  const html = htmlEscalamiento({
    cuerpo: 'Estimados,\n\nTipo de falla: Caída total',
    codigo: '00071M', nivel: 2,
    ahora: new Date('2026-09-11T20:30:00.000Z'), // 15:30 en Lima
  })

  it('referencia el logo por CID, no por URL remota ni data: URI', () => {
    expect(html).toContain(`src="cid:${LOGO_CID}"`)
    expect(html).not.toContain('src="data:')
    expect(html).not.toMatch(/src="https?:/)
  })

  it('no usa gradientes CSS: Outlook los ignora y la franja quedaría en blanco', () => {
    expect(html).not.toContain('linear-gradient')
    // La franja de marca son tres celdas sólidas.
    for (const c of ['#7c5cf5', '#3b82f6', '#00b4d8']) expect(html).toContain(`background:${c}`)
  })

  it('fecha del pie en hora de Lima, no UTC', () => {
    expect(html).toContain('11/09/2026')
    expect(html).toContain('03:30 p')
    expect(html).not.toContain('08:30 p')
  })

  it('escapa el HTML que venga en el texto del agente', () => {
    const inyectado = htmlEscalamiento({ cuerpo: 'Nota: <script>alert(1)</script>', codigo: 'X', nivel: 1 })
    expect(inyectado).not.toContain('<script>')
    expect(inyectado).toContain('&lt;script&gt;')
  })

  it('lleva el branding del pie', () => {
    expect(html).toContain('Monitoreo Footloose Perú')
    expect(html).toContain('NIVEL 2')
    expect(html).toContain('00071M')
  })
})

describe('escapeHtml', () => {
  it('cubre los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
})

describe('bytesDeBase64', () => {
  it('mide los bytes reales, no el largo de la cadena', () => {
    expect(bytesDeBase64(b64De(1000))).toBe(1000)
    expect(bytesDeBase64(b64De(1001))).toBe(1001)
    expect(bytesDeBase64(b64De(1002))).toBe(1002)
    expect(bytesDeBase64('')).toBe(0)
  })
})

describe('validarAdjuntos', () => {
  it('sin adjuntos es válido — el correo sale igual', () => {
    expect(validarAdjuntos(undefined)).toEqual({ ok: true, archivos: [] })
    expect(validarAdjuntos([])).toEqual({ ok: true, archivos: [] })
  })

  it('acepta hasta 3 imágenes', () => {
    const r = validarAdjuntos([imagen(100), imagen(100), imagen(100)])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.archivos).toHaveLength(MAX_ADJUNTOS)
  })

  it('rechaza el cuarto adjunto', () => {
    const r = validarAdjuntos([imagen(10), imagen(10), imagen(10), imagen(10)])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Máximo 3')
  })

  it('rechaza un archivo de más de 5 MB', () => {
    const r = validarAdjuntos([imagen(MAX_ADJUNTO_BYTES + 1)])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('El máximo por archivo es 5 MB')
  })

  it('acepta exactamente 5 MB — el límite mide bytes decodificados, no base64', () => {
    // En base64 esto ocupa ~6.7 MB de string; medir el string lo rechazaría.
    expect(validarAdjuntos([imagen(MAX_ADJUNTO_BYTES)]).ok).toBe(true)
  })

  it('rechaza lo que no sea JPG, PNG o WebP', () => {
    const r = validarAdjuntos([imagen(100, 'application/pdf')])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Solo se aceptan JPG, PNG o WebP')
  })

  it('rechaza una dataUrl malformada', () => {
    const r = validarAdjuntos([{ nombre: 'x.png', tipo: 'image/png', dataUrl: 'no-soy-una-data-url' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('no es una imagen válida')
  })

  it('devuelve el base64 listo para nodemailer, sin el prefijo data:', () => {
    const r = validarAdjuntos([imagen(50)])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.archivos[0].base64.startsWith('data:')).toBe(false)
      expect(Buffer.from(r.archivos[0].base64, 'base64')).toHaveLength(50)
      expect(r.archivos[0].contentType).toBe('image/png')
    }
  })
})
