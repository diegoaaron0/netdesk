/**
 * geo-zones.ts — única fuente de verdad para clasificación geográfica de tiendas.
 * IMPORTANTE: cluster A/B/C/D es segmento comercial, NO zona geográfica.
 * La zona se determina exclusivamente por el campo distrito.
 */

const LIMA_NORTE = [
  'comas', 'independencia', 'los olivos', 'san martín de porres', 'san martin de porres',
  'carabayllo', 'puente piedra', 'ancón', 'ancon', 'santa rosa', 'rimac', 'rímac',
]
const LIMA_ESTE = [
  'san juan de lurigancho', 'ate', 'el agustino', 'santa anita',
  'chaclacayo', 'cieneguilla', 'la molina', 'lurigancho',
]
const LIMA_SUR = [
  'san juan de miraflores', 'villa el salvador', 'villa maría del triunfo', 'villa maria del triunfo',
  'chorrillos', 'lurín', 'lurin', 'pachacamac', 'barranco',
  'pucusana', 'punta hermosa', 'punta negra', 'san bartolo',
]
const LIMA_CENTRO = [
  'miraflores', 'surquillo', 'san isidro', 'san borja', 'surco', 'santiago de surco',
  'san luis', 'la victoria', 'lince', 'magdalena', 'pueblo libre', 'san miguel',
  'jesús maría', 'jesus maria', 'breña', 'brena', 'cercado',
]
const CALLAO = [
  'callao', 'bellavista', 'la perla', 'la punta', 'ventanilla',
  'mi perú', 'mi peru', 'carmen de la legua',
]

export function getZona(distrito: string | null, _cluster?: string | null): string {
  if (!distrito) return 'Provincia'
  const d = distrito.toLowerCase().trim()
  if (LIMA_NORTE.some((z) => d.includes(z))) return 'Lima Norte'
  if (LIMA_ESTE.some((z) => d.includes(z))) return 'Lima Este'
  if (LIMA_SUR.some((z) => d.includes(z))) return 'Lima Sur'
  if (LIMA_CENTRO.some((z) => d.includes(z))) return 'Lima Centro'
  if (CALLAO.some((z) => d.includes(z))) return 'Callao'
  if (d.includes('lima')) return 'Lima Centro'
  return 'Provincia'
}
