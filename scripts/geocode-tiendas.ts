import { db } from '../lib/db'
import { tiendas } from '../drizzle/schema'
import { isNull, or, eq, sql } from 'drizzle-orm'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const DELAY_MS = 1100

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function geocode(query: string): Promise<{ lat: string; lon: string } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=pe`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NetDesk-Footloose/1.0' },
  })
  if (!res.ok) return null
  const data = await res.json() as Array<{ lat: string; lon: string }>
  return data.length > 0 ? { lat: data[0].lat, lon: data[0].lon } : null
}

async function main() {
  const rows = await db
    .select({
      id:        tiendas.id,
      codigo:    tiendas.codigo,
      nombreCc:  tiendas.nombreCc,
      distrito:  tiendas.distrito,
      provincia: tiendas.provincia,
      direccion: tiendas.direccion,
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

  for (const t of rows) {
    const partes: string[] = []
    if (t.direccion) partes.push(t.direccion)
    if (t.distrito)  partes.push(t.distrito)
    if (t.provincia) partes.push(t.provincia)
    partes.push('Peru')
    const query = partes.join(', ')

    const resultado = await geocode(query)

    if (resultado) {
      const coordStr = `${resultado.lat},${resultado.lon}`
      await db
        .update(tiendas)
        .set({ coordenadas: coordStr })
        .where(eq(tiendas.id, t.id))
      console.log(`✓ ${t.codigo} | ${t.nombreCc ?? '—'} → ${coordStr}`)
      exitosas++
    } else {
      console.log(`✗ ${t.codigo} | ${t.nombreCc ?? '—'} → sin resultado (query: "${query}")`)
      sinResultado++
    }

    await sleep(DELAY_MS)
  }

  console.log('\n─── Resumen ───')
  console.log(`Total procesadas : ${rows.length}`)
  console.log(`Exitosas         : ${exitosas}`)
  console.log(`Sin resultado    : ${sinResultado}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
