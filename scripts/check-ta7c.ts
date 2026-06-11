import 'dotenv/config'
import postgres from 'postgres'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no definida')
  const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.NODE_ENV === 'production' ? 'require' : false })

  // TA7-C y su padre TA7
  const tiendas = await sql`
    SELECT t.id, t.codigo, t.nombre_cc, t.tipo_local, t.proveedor_id,
           t.ficha_activa_id, t.tienda_padre_id,
           p.nombre AS proveedor_nombre
    FROM tiendas t
    LEFT JOIN proveedores p ON t.proveedor_id = p.id
    WHERE t.codigo IN ('TA7', 'TA7-C')
    ORDER BY t.codigo
  `
  console.log('\n── Tiendas TA7 y TA7-C ──')
  console.table(tiendas)

  // Proveedor CONVERGIA
  const convergia = await sql`SELECT id, nombre FROM proveedores WHERE nombre ILIKE '%CONVERGIA%' LIMIT 5`
  console.log('\n── Proveedores CONVERGIA ──')
  console.table(convergia)

  // Ficha activa de TA7 (para referencia de SLA)
  const fichaTA7 = await sql`
    SELECT f.id, f.codigo, f.estado, f.plan, f.tipo_servicio,
           f.tiempo_respuesta_sla, f.tiempo_resolucion_sla,
           f.cid_servicio, f.tipo_conexion, f.velocidad,
           f.costo_mensual, f.estado_servicio,
           p.nombre AS proveedor_nombre
    FROM fichas f
    JOIN tiendas t ON f.tienda_id = t.id
    LEFT JOIN proveedores p ON f.proveedor_id = p.id
    WHERE t.codigo = 'TA7' AND f.estado = 'ACTIVA'
  `
  console.log('\n── Ficha activa de TA7 (referencia) ──')
  console.table(fichaTA7)

  // ¿Ya tiene ficha TA7-C?
  const fichaTA7C = await sql`
    SELECT f.id, f.codigo, f.estado, p.nombre AS proveedor_nombre
    FROM fichas f
    JOIN tiendas t ON f.tienda_id = t.id
    LEFT JOIN proveedores p ON f.proveedor_id = p.id
    WHERE t.codigo = 'TA7-C'
  `
  console.log('\n── Fichas existentes de TA7-C ──')
  console.table(fichaTA7C)

  await sql.end()
}

main().catch(console.error)
