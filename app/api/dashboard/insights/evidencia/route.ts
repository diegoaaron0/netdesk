import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { EvidenciaIncidente } from '@/types/insights'

function slaLimiteMin(tipo: string): number {
  if (tipo === 'CAIDA_TOTAL') return 240
  if (tipo === 'INTERMITENCIA') return 480
  if (tipo === 'LENTITUD') return 720
  return 240
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo     = searchParams.get('tipo')     // 'proveedor' | 'tienda' | 'zona' | 'tipo' | 'global'
  const entidad  = searchParams.get('entidad')  // nombre del proveedor, tienda, zona, etc.
  const desdeP   = searchParams.get('desde')
  const hastaP   = searchParams.get('hasta')

  const hasta = hastaP ? new Date(hastaP + 'T23:59:59').toISOString() : new Date().toISOString()
  const desde = desdeP ? new Date(desdeP + 'T00:00:00').toISOString() : (() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
  })()

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.estado,
      i.otros_clasificacion,
      p.nombre        AS prov_nombre,
      t.nombre_cc     AS tienda_nombre,
      t.distrito      AS tienda_distrito,
      t.cluster,
      t.venta_hora_soles::float AS venta_hora_soles,
      n1.hora_correo_n1,
      max_n.max_nivel
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores p ON i.proveedor_id = p.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo AS hora_correo_n1
      FROM   escalamientos
      WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
      ORDER  BY creado_en LIMIT 1
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(MAX(nivel), 0) AS max_nivel
      FROM   escalamientos
      WHERE  incidente_id = i.id
    ) max_n ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
      ${tipo === 'proveedor' && entidad ? sql`AND p.nombre ILIKE ${entidad}` : sql``}
      ${tipo === 'tienda'    && entidad ? sql`AND t.nombre ILIKE ${entidad}` : sql``}
      ${tipo === 'tipo'      && entidad ? sql`AND i.tipo = ${entidad}` : sql``}
    ORDER BY i.hora_registro DESC
    LIMIT 200
  `) as unknown as Array<{
    id: string; codigo: string; tipo: string; hora_registro: string; hora_fin: string | null
    estado: string; otros_clasificacion: string | null; prov_nombre: string | null
    tienda_nombre: string | null; tienda_distrito: string | null; cluster: string | null
    venta_hora_soles: number | null; hora_correo_n1: string | null; max_nivel: number
  }>

  function getZona(distrito: string | null, cluster: string | null): string {
    if (cluster) return cluster
    if (!distrito) return 'Provincia'
    const d = distrito.toUpperCase()
    if (['INDEPENDENCIA','LOS OLIVOS','SAN MARTIN DE PORRES','COMAS','CARABAYLLO','PUENTE PIEDRA','RIMAC','ANCON','SANTA ROSA'].some(n => d.includes(n))) return 'Lima Norte'
    if (['ATE','LA MOLINA','SANTA ANITA','EL AGUSTINO','LURIGANCHO','CHACLACAYO','CIENEGUILLA','SAN JUAN DE LURIGANCHO'].some(n => d.includes(n))) return 'Lima Este'
    if (['VILLA EL SALVADOR','VILLA MARIA DEL TRIUNFO','SAN JUAN DE MIRAFLORES','CHORRILLOS','BARRANCO','SURCO','LURÍN','LURIN','PACHACAMAC'].some(n => d.includes(n))) return 'Lima Sur'
    if (['MIRAFLORES','SAN ISIDRO','SAN BORJA','SURQUILLO','MAGDALENA','JESUS MARIA','LINCE','LA VICTORIA','LIMA','BREÑA','PUEBLO LIBRE'].some(n => d.includes(n))) return 'Lima Centro'
    if (['CALLAO','BELLAVISTA','LA PERLA','LA PUNTA','CARMEN DE LA LEGUA','VENTANILLA','MI PERU'].some(n => d.includes(n))) return 'Callao'
    return 'Provincia'
  }

  const filtered = tipo === 'zona' && entidad
    ? rows.filter(r => getZona(r.tienda_distrito, r.cluster) === entidad)
    : rows

  const evidencias: EvidenciaIncidente[] = filtered.map(r => {
    const isEval = r.estado === 'RESUELTO' && r.hora_fin != null && r.hora_correo_n1 != null && r.max_nivel >= 1
    let slaCumplido: boolean | null = null
    let mttrMin: number | null = null
    let impactoEstimado: number | null = null
    if (r.hora_fin && r.estado === 'RESUELTO') {
      mttrMin = Math.round((new Date(r.hora_fin).getTime() - new Date(r.hora_registro).getTime()) / 60000)
      const venta = r.venta_hora_soles ?? 500
      impactoEstimado = Math.round((mttrMin / 60) * venta * 0.35)
    }
    if (isEval) {
      slaCumplido = r.max_nivel >= 2 ? false : (mttrMin != null ? mttrMin <= slaLimiteMin(r.tipo) : null)
    }
    return {
      id: r.id, codigo: r.codigo, tipo: r.tipo,
      proveedor: r.prov_nombre ?? '—',
      tienda: r.tienda_nombre ?? '—',
      distrito: r.tienda_distrito ?? '—',
      horaRegistro: r.hora_registro, horaFin: r.hora_fin,
      estado: r.estado, slaCumplido, mttrMin, impactoEstimado,
      otrosClasificacion: r.otros_clasificacion,
    }
  })

  return NextResponse.json({ evidencias })
}
