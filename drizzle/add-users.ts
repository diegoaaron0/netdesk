import 'dotenv/config'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'

const nuevosUsuarios = [
  { nombre: 'Edson Puelles', email: 'edson.puelles@footloose.pe', rol: 'INFRAESTRUCTURA' as const },
  { nombre: 'Valentín',      email: 'valentin@footloose.pe',       rol: 'INFRAESTRUCTURA' as const },
]

async function main() {
  for (const u of nuevosUsuarios) {
    await db.insert(usuarios).values({
      nombre: u.nombre,
      email: u.email,
      password: 'soporte123',
      rol: u.rol,
      activo: true,
    }).onConflictDoNothing()
    console.log(`Insertado: ${u.nombre} (${u.rol})`)
  }
  console.log('Listo.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
