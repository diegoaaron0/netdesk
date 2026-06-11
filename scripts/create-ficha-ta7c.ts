import postgres from 'postgres'

const TA7C_ID       = 'ea2606aa-0824-43b7-91c1-9c210bb81715'
const CONVERGIA_ID  = '6727f379-9527-4aee-b54d-d5c68ca7f496'

async function main() {
  const sql = postgres('postgresql://postgres:cbaEdUFlVULJNdlsdHdqBelVllfBMZwL@tramway.proxy.rlwy.net:10333/railway', { ssl: 'require' })

  // Calcular siguiente número de ficha
  const [{ max_n }] = await sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 2) AS INTEGER)), 0) AS max_n
    FROM fichas
    WHERE codigo ~ '^FC-[0-9]+-'
  `
  const siguienteN = Number(max_n) + 1
  const codigo = `FC-${String(siguienteN).padStart(3, '0')}-TA7C`
  console.log(`Código generado: ${codigo}`)

  // Crear ficha ACTIVA para TA7-C con CONVERGIA
  const [ficha] = await sql`
    INSERT INTO fichas (
      codigo, tienda_id, proveedor_id, estado,
      tiempo_respuesta_sla, tiempo_resolucion_sla,
      activado_en, creado_en
    ) VALUES (
      ${codigo}, ${TA7C_ID}, ${CONVERGIA_ID}, 'ACTIVA',
      60, 90,
      NOW(), NOW()
    )
    RETURNING id, codigo, estado
  `
  console.log('\n✓ Ficha creada:')
  console.log(ficha)

  // Actualizar tienda TA7-C: asignar proveedor y ficha activa
  await sql`
    UPDATE tiendas
    SET proveedor_id    = ${CONVERGIA_ID},
        ficha_activa_id = ${ficha.id}
    WHERE id = ${TA7C_ID}
  `
  console.log('\n✓ Tienda TA7-C actualizada con proveedorId=CONVERGIA y fichaActivaId')

  // Verificación final
  const [check] = await sql`
    SELECT t.codigo, t.tipo_local, p.nombre AS proveedor, f.codigo AS ficha, f.estado AS ficha_estado
    FROM tiendas t
    LEFT JOIN proveedores p ON t.proveedor_id = p.id
    LEFT JOIN fichas f ON t.ficha_activa_id = f.id
    WHERE t.id = ${TA7C_ID}
  `
  console.log('\n── Estado final de TA7-C ──')
  console.log(check)

  await sql.end()
}

main().catch(console.error)
