import { db } from './db'
import { sql } from 'drizzle-orm'

export interface RawIncidente {
  id: string
  codigo: string
  tipo: string
  estado: string
  mttr_minutos: number | null
  hora_registro: Date
  hora_fin: Date | null
  proveedor_id: string | null
  tienda_id: string
  tienda_codigo: string
  tienda_nombre: string | null
  tienda_distrito: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean
  contingencia_activa: boolean
  prov_nombre: string | null
  dia_semana: number
  // Campos SLA (de LATERAL joins)
  hora_correo_n1: Date | null
  hora_primera_resp: Date | null
  nivel_respuesta: number | null
  max_nivel: number | null
}

export interface RawEscalamiento {
  id: string
  incidente_id: string
  nivel: number
  hora_envio_correo: Date | null
  hora_respuesta: Date | null
  tiempo_respuesta_min: number | null
  tiempo_resp_sev1: string | null
}

export interface RawVentaDiaria {
  tienda_codigo: string
  dia_semana: number
  venta_hora_promedio: number
}

export async function fetchIncidentesPeriodo(
  desde: string,
  hasta: string,
  proveedorNombre?: string | null,
): Promise<RawIncidente[]> {
  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.estado,
      i.mttr_minutos,
      i.hora_registro,
      i.hora_fin,
      i.proveedor_id,
      t.id        AS tienda_id,
      t.codigo    AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      t.distrito  AS tienda_distrito,
      t.cluster,
      t.venta_hora_soles::float                   AS venta_hora_soles,
      COALESCE(t.tiene_contingencia, false)        AS tiene_contingencia,
      COALESCE(t.contingencia_activa, false)       AS contingencia_activa,
      COALESCE(p.nombre, pt.nombre)               AS prov_nombre,
      EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'America/Lima')::int AS dia_semana,
      n1.hora_correo_n1,
      resp.hora_primera_resp,
      resp.nivel_respuesta,
      max_n.max_nivel
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo AS hora_correo_n1
      FROM   escalamientos
      WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
      ORDER  BY creado_en LIMIT 1
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT hora_respuesta AS hora_primera_resp, nivel AS nivel_respuesta
      FROM   escalamientos
      WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
      ORDER  BY hora_respuesta LIMIT 1
    ) resp ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(MAX(nivel), 0) AS max_nivel
      FROM   escalamientos
      WHERE  incidente_id = i.id
    ) max_n ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
      ${proveedorNombre ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorNombre}` : sql``}
    ORDER BY i.hora_registro DESC
  `)
  return rows as unknown as RawIncidente[]
}

export async function fetchEscalamientosPeriodo(
  desde: string,
  hasta: string,
  proveedorNombre?: string | null,
): Promise<RawEscalamiento[]> {
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.incidente_id,
      e.nivel,
      e.hora_envio_correo,
      e.hora_respuesta,
      e.tiempo_respuesta_min,
      ne.tiempo_resp_sev1
    FROM escalamientos e
    JOIN incidentes i ON e.incidente_id = i.id
    JOIN tiendas t    ON i.tienda_id    = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN niveles_escalamiento ne ON e.nivel_esc_id = ne.id
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
      ${proveedorNombre ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorNombre}` : sql``}
  `)
  return rows as unknown as RawEscalamiento[]
}

export async function fetchVentasDiarias(): Promise<RawVentaDiaria[]> {
  try {
    const rows = await db.execute(sql`
      SELECT tienda_codigo, dia_semana::int, venta_hora_promedio::float
      FROM tiendas_ventas_diarias
    `)
    return rows as unknown as RawVentaDiaria[]
  } catch {
    return []
  }
}

export async function fetchProveedoresList(): Promise<Array<{ id: string; nombre: string }>> {
  const rows = await db.execute(sql`
    SELECT id, nombre FROM proveedores ORDER BY nombre
  `)
  return rows as unknown as Array<{ id: string; nombre: string }>
}
