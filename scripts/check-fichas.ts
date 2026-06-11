import postgres from 'postgres'

async function main() {
const sql = postgres('postgresql://postgres:cbaEdUFlVULJNdlsdHdqBelVllfBMZwL@tramway.proxy.rlwy.net:10333/railway', { ssl: 'require' })

const [totales] = await sql`
  SELECT
    COUNT(*)::int                       AS total_tiendas,
    COUNT(ficha_activa_id)::int         AS con_ficha_activa,
    (COUNT(*) - COUNT(ficha_activa_id))::int AS sin_ficha_activa
  FROM tiendas
`
console.log('\n=== TIENDAS vs FICHA ACTIVA ===')
console.log(`Total tiendas:        ${totales.total_tiendas}`)
console.log(`Con ficha_activa_id:  ${totales.con_ficha_activa}`)
console.log(`Sin ficha_activa_id:  ${totales.sin_ficha_activa}`)

// Tienen fichaActivaId pero la ficha no está en estado ACTIVA
const fichaNoActiva = await sql`
  SELECT t.codigo, t.nombre_cc, f.estado, f.codigo AS ficha_codigo
  FROM tiendas t
  JOIN fichas f ON f.id = t.ficha_activa_id
  WHERE f.estado != 'ACTIVA'
  ORDER BY t.codigo
`
console.log(`\nTiendas con fichaActivaId pero ficha NO en estado ACTIVA: ${fichaNoActiva.length}`)
if (fichaNoActiva.length > 0) console.table(fichaNoActiva)

// No tienen fichaActivaId — cuáles son
const sinFicha = await sql`
  SELECT t.codigo, t.nombre_cc, p.nombre AS proveedor,
         t.tipo_conexion, t.cid_servicio, t.velocidad
  FROM tiendas t
  LEFT JOIN proveedores p ON p.id = t.proveedor_id
  WHERE t.ficha_activa_id IS NULL
  ORDER BY t.codigo
`
console.log(`\nTiendas SIN ficha_activa_id (${sinFicha.length}):`)
if (sinFicha.length > 0) console.table(sinFicha)
else console.log('  Ninguna — todas tienen ficha activa')

await sql.end()
}
main().catch(console.error)
