import 'dotenv/config'
import postgres from 'postgres'

// Corrects all timestamps that were stored in Lima local time (UTC-5)
// as if they were UTC. Shifts them +5 hours to actual UTC.
// Run ONCE after adding TimeZone:'UTC' to the DB connection.
async function run() {
  const client = postgres(process.env.DATABASE_URL!, { connection: { TimeZone: 'UTC' } })

  // Check how many rows need fixing (those where hora_registro appears shifted 5h)
  const sample = await client`SELECT id, hora_registro FROM incidentes LIMIT 3`
  console.log('Sample antes:', sample.map((r: any) => ({ id: r.id.slice(0,8), hora: r.hora_registro })))

  // Shift all timestamps +5 hours (Lima UTC-5 → UTC)
  const r1 = await client`
    UPDATE incidentes
    SET
      hora_registro           = hora_registro + interval '5 hours',
      hora_inicio_seguimiento = hora_inicio_seguimiento + interval '5 hours',
      hora_fin                = CASE WHEN hora_fin IS NOT NULL THEN hora_fin + interval '5 hours' END,
      actualizado_en          = actualizado_en + interval '5 hours'
    WHERE hora_registro < NOW() - interval '4 hours 50 minutes'
  `
  console.log('Incidentes corregidos:', r1.count)

  const r2 = await client`
    UPDATE escalamientos
    SET
      hora_envio_correo = CASE WHEN hora_envio_correo IS NOT NULL THEN hora_envio_correo + interval '5 hours' END,
      hora_respuesta    = CASE WHEN hora_respuesta IS NOT NULL THEN hora_respuesta + interval '5 hours' END,
      creado_en         = creado_en + interval '5 hours'
    WHERE creado_en < NOW() - interval '4 hours 50 minutes'
  `
  console.log('Escalamientos corregidos:', r2.count)

  const sample2 = await client`SELECT id, hora_registro FROM incidentes LIMIT 3`
  console.log('Sample después:', sample2.map((r: any) => ({ id: r.id.slice(0,8), hora: r.hora_registro })))

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
