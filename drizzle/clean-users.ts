import 'dotenv/config'
import postgres from 'postgres'

const keep = ['angela@footloose.pe', 'diego@footloose.pe', 'bryant@footloose.pe', 'marcelo@footloose.pe', 'luis@footloose.pe']

async function run() {
  const client = postgres(process.env.DATABASE_URL!)
  const deleted = await client`DELETE FROM usuarios WHERE email != ALL(${keep}) RETURNING nombre, email`
  console.log('Eliminados:', deleted.length ? deleted.map((u: any) => u.email).join(', ') : 'ninguno')
  const remaining = await client`SELECT nombre, email, rol FROM usuarios ORDER BY rol, nombre`
  console.log('Usuarios actuales:')
  remaining.forEach((u: any) => console.log(`  ${String(u.rol).padEnd(10)} ${u.nombre} <${u.email}>`))
  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
