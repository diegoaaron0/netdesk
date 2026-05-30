import fs from 'fs'

const csvPath = process.argv[2] ?? 'C:/Users/diego/Downloads/inventario_servicios_internet.csv'

// El CSV de Excel se exporta en Latin-1 (Windows-1252), no UTF-8.
// Leerlo como 'binary' y dejar que JavaScript interprete los bytes como Latin-1.
const raw = fs.readFileSync(csvPath, 'binary')
// Strip BOM (UTF-8 BOM leído como Latin-1 = ï»¿)
const content = raw.replace(/^(\xff\xfe|\xef\xbb\xbf|ï»¿)/, '')

// Parses entire CSV respecting multi-line quoted fields
function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      row.push(cur.trim()); cur = ''
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && text[i + 1] === '\n') i++
      if (row.length > 0 || cur.trim()) { row.push(cur.trim()); rows.push(row) }
      row = []; cur = ''
    } else { cur += c }
  }
  if (cur.trim() || row.length) { row.push(cur.trim()); rows.push(row) }
  return rows
}

const all = parseCSV(content)
const headers = all[0].map(h => h.trim())

// Convierte string Latin-1 (binary) a UTF-8 correctamente
function toUtf8(s) {
  if (!s) return s
  return Buffer.from(s, 'binary').toString('utf-8')
}

function esc(s) {
  if (s === null || s === undefined || s === '') return 'NULL'
  const fixed = toUtf8(s.toString())
  return `'${fixed.replace(/'/g, "''")}'`
}

function parseBool(s) {
  const v = toUtf8(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return (v === 'si' || v === 'yes' || v === 'true') ? 'true' : 'false'
}

function parseNum(s) {
  const n = parseFloat((s || '').replace(',', '.'))
  return isNaN(n) ? 'NULL' : n.toString()
}

const SKIP = ['ENLACE DE CAMARAS', 'ENLACE PRINCIPAL', 'ENLACE SECUNDARIO', 'ALMACEN W4', 'RESTAURANTE R18']
const VALID_CLUSTERS = ['A', 'B', 'C', 'D']

const rows = []
for (let i = 1; i < all.length; i++) {
  const vals = all[i]
  const row = {}
  headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim() })
  const codigo = (row['codigo'] || '').toUpperCase().trim()
  if (!codigo || SKIP.includes(codigo)) continue
  rows.push({ ...row, codigo })
}

const dataLines = rows.map(r => {
  const codigo        = esc(r.codigo)
  const referencia    = esc(r.referencia)           // CSV referencia → DB referencia
  const formato       = esc(r.formato)
  const direccion     = esc(r.direccion)
  const distrito      = esc(r.distrito)
  const provincia     = esc(r.provincia)
  const tipo_conexion = esc(r.tipo_conexion)
  const cid_servicio  = esc(r.cid_servicio === 'ID-TIENDA' ? null : r.cid_servicio)
  const desc          = esc((r.descripcion_servicio || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' '))
  const costo         = parseNum(r.costo_mensual_sin_igv)
  const gabinete      = parseBool(r.gabinete)
  const tiene_cont    = parseBool(r.contingencia)
  const cluster       = VALID_CLUSTERS.includes(r.cluster) ? esc(r.cluster) : 'NULL'
  const supervisor    = esc(r.supervisor)
  const vigencia      = esc(r.vigencia_contrato)
  const observacion   = esc((r.observacion || '').replace(/\s*\n\s*/g, ' ').trim())

  return `  (${codigo}, ${referencia}, ${formato}, ${direccion}, ${distrito}, ${provincia}, ${tipo_conexion}, ${cid_servicio}, ${desc}, ${costo}, ${gabinete}, ${tiene_cont}, ${cluster}, ${supervisor}, ${vigencia}, ${observacion})`
})

const sql = `-- Generado desde: ${csvPath}
-- Tiendas procesadas: ${rows.length}

WITH data(codigo, referencia, formato, direccion, distrito, provincia, tipo_conexion, cid_servicio, descripcion_servicio, costo_mensual, gabinete, tiene_contingencia, cluster, supervisor_nombre, vigencia_contrato, observacion) AS (
  VALUES
${dataLines.join(',\n')}
)
UPDATE tiendas t SET
  referencia           = d.referencia,
  formato              = d.formato,
  direccion            = COALESCE(d.direccion, t.direccion),
  distrito             = COALESCE(d.distrito, t.distrito),
  provincia            = COALESCE(d.provincia, t.provincia),
  tipo_conexion        = d.tipo_conexion,
  cid_servicio         = d.cid_servicio,
  descripcion_servicio = d.descripcion_servicio,
  costo_mensual        = CASE WHEN d.costo_mensual IS NOT NULL THEN d.costo_mensual::numeric ELSE t.costo_mensual END,
  gabinete             = d.gabinete::boolean,
  tiene_contingencia   = d.tiene_contingencia::boolean,
  cluster              = COALESCE(d.cluster::cluster_tienda, t.cluster),
  supervisor_nombre    = d.supervisor_nombre,
  vigencia_contrato    = d.vigencia_contrato,
  observacion          = d.observacion
FROM data d
WHERE t.codigo = d.codigo;
`

const outPath = 'scripts/tiendas-update.sql'
fs.writeFileSync(outPath, sql, 'utf-8')
process.stderr.write(`✓ ${rows.length} tiendas — SQL guardado en ${outPath}\n`)
