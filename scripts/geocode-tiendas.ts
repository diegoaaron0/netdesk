import { db } from '../lib/db'
import { tiendas } from '../drizzle/schema'
import { isNull, or, eq } from 'drizzle-orm'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const DELAY_MS = 1100

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function geocode(query: string): Promise<{ lat: string; lon: string } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=pe`
  const res = await fetch(url, { headers: { 'User-Agent': 'NetDesk-Footloose/1.0' } })
  if (!res.ok) return null
  const data = await res.json() as Array<{ lat: string; lon: string }>
  return data.length > 0 ? { lat: data[0].lat, lon: data[0].lon } : null
}

async function geocodeConFallback(t: {
  nombreCc: string | null
  distrito: string | null
  provincia: string | null
}): Promise<{ lat: string; lon: string; intento: number; query: string } | null> {
  const intentos: string[] = []

  // Intento 1: nombreCc + distrito + Peru
  if (t.nombreCc && t.distrito) {
    intentos.push([t.nombreCc, t.distrito, 'Peru'].join(' '))
  } else if (t.nombreCc) {
    intentos.push([t.nombreCc, 'Peru'].join(' '))
  }

  // Intento 2: distrito + provincia + Peru
  if (t.distrito && t.provincia) {
    intentos.push([t.distrito, t.provincia, 'Peru'].join(' '))
  } else if (t.distrito) {
    intentos.push([t.distrito, 'Peru'].join(' '))
  }

  // Intento 3: provincia + Peru (coordenada aproximada)
  if (t.provincia) {
    intentos.push([t.provincia, 'Peru'].join(' '))
  }

  for (let i = 0; i < intentos.length; i++) {
    const query = intentos[i]
    const resultado = await geocode(query)
    if (resultado) return { ...resultado, intento: i + 1, query }
    if (i < intentos.length - 1) await sleep(DELAY_MS)
  }

  return null
}

async function main() {
  const rows = await db
    .select({
      id:        tiendas.id,
      codigo:    tiendas.codigo,
      nombreCc:  tiendas.nombreCc,
      distrito:  tiendas.distrito,
      provincia: tiendas.provincia,
    })
    .from(tiendas)
    .where(or(isNull(tiendas.coordenadas), eq(tiendas.coordenadas, '')))

  console.log(`Tiendas sin coordenadas: ${rows.length}`)
  if (rows.length === 0) {
    console.log('Nada que procesar.')
    process.exit(0)
  }

  let exitosas = 0
  let sinResultado = 0
  const porIntento = [0, 0, 0]

  for (const t of rows) {
    const resultado = await geocodeConFallback(t)

    if (resultado) {
      const coordStr = `${resultado.lat},${resultado.lon}`
      await db.update(tiendas).set({ coordenadas: coordStr }).where(eq(tiendas.id, t.id))
      console.log(`✓ [i${resultado.intento}] ${t.codigo} | ${t.nombreCc ?? '—'} → ${coordStr}  ("${resultado.query}")`)
      exitosas++
      porIntento[resultado.intento - 1]++
    } else {
      console.log(`✗       ${t.codigo} | ${t.nombreCc ?? '—'} → sin resultado`)
      sinResultado++
    }

    await sleep(DELAY_MS)
  }

  console.log('\n─── Resumen ───')
  console.log(`Total procesadas : ${rows.length}`)
  console.log(`Exitosas         : ${exitosas}`)
  console.log(`  · Intento 1    : ${porIntento[0]}`)
  console.log(`  · Intento 2    : ${porIntento[1]}`)
  console.log(`  · Intento 3    : ${porIntento[2]}`)
  console.log(`Sin resultado    : ${sinResultado}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
