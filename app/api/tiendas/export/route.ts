import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtBool(v: unknown): string {
  if (v === true  || v === 't' || v === 'true')  return 'Sí'
  if (v === false || v === 'f' || v === 'false') return 'No'
  return ''
}

function fmtFecha(v: unknown): string {
  if (!v) return ''
  try {
    return new Date(String(v)).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
    })
  } catch { return String(v) }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'reportes.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  try {
    const rows = await db.execute(sql`
      SELECT
        t.codigo,
        t.nombre_cc,
        t.referencia,
        t.formato,
        t.direccion,
        t.distrito,
        t.provincia,
        t.ubicacion,
        COALESCE(p.nombre, '')              AS proveedor,
        t.tipo_conexion,
        t.tipo_servicio,
        t.cid_servicio,
        t.descripcion_servicio,
        t.costo_mensual,
        t.venta_hora_soles,
        t.velocidad,
        t.plan_aplicado,
        t.vigencia_contrato,
        t.fecha_alta_servicio,
        t.estado_servicio,
        CASE WHEN COALESCE(t.gabinete, false) THEN 'Sí' ELSE 'No' END    AS gabinete,
        CASE WHEN COALESCE(t.tiene_contingencia, false) THEN 'Sí' ELSE 'No' END AS tiene_contingencia,
        CASE WHEN COALESCE(t.contingencia_activa, false) THEN 'Sí' ELSE 'No' END AS contingencia_activa,
        t.contingencia_chip,
        t.contingencia_paquete,
        t.cluster,
        t.supervisor_nombre,
        t.supervisor_celular,
        t.celular_tienda,
        t.contacto_soporte,
        t.administrador_nombre,
        t.administrador_email,
        t.administrador_celular,
        t.instruccion_reporte,
        t.observacion,
        t.extras,
        t.coordenadas
      FROM tiendas t
      LEFT JOIN proveedores p ON t.proveedor_id = p.id
      ORDER BY t.codigo
    `)

    const headers = [
      'Código Tienda', 'Nombre CC', 'Grupo', 'Formato',
      'Dirección', 'Distrito', 'Provincia', 'Ubicación',
      'Proveedor', 'Tipo Conexión', 'Tipo Servicio', 'CID Servicio', 'Descripción Servicio',
      'Costo Mensual (S/.)', 'Venta/Hora (S/.)', 'Velocidad', 'Plan Aplicado',
      'Vigencia Contrato', 'Fecha Alta Servicio', 'Estado Servicio', 'Gabinete',
      'Tiene Contingencia', 'Contingencia Activa', 'Chip Contingencia', 'Paquete Contingencia',
      'Cluster', 'Supervisor', 'Celular Supervisor', 'Celular Tienda', 'Contacto Soporte',
      'Admin. Nombre', 'Admin. Email', 'Admin. Celular',
      'Instrucción Específica', 'Observación', 'Extras', 'Coordenadas',
    ]

    const CRLF = '\r\n'
    const lines = [
      headers.join(','),
      ...(rows as any[]).map(r => [
        r.codigo,
        r.nombre_cc ?? '',
        r.referencia ?? '',
        r.formato ?? '',
        r.direccion ?? '',
        r.distrito ?? '',
        r.provincia ?? '',
        r.ubicacion ?? '',
        r.proveedor,
        r.tipo_conexion ?? '',
        r.tipo_servicio ?? '',
        r.cid_servicio ?? '',
        r.descripcion_servicio ?? '',
        r.costo_mensual ?? '',
        r.venta_hora_soles ?? '',
        r.velocidad ?? '',
        r.plan_aplicado ?? '',
        r.vigencia_contrato ?? '',
        fmtFecha(r.fecha_alta_servicio),
        r.estado_servicio ?? '',
        r.gabinete,
        r.tiene_contingencia,
        r.contingencia_activa,
        r.contingencia_chip ?? '',
        r.contingencia_paquete ?? '',
        r.cluster ?? '',
        r.supervisor_nombre ?? '',
        r.supervisor_celular ?? '',
        r.celular_tienda ?? '',
        r.contacto_soporte ?? '',
        r.administrador_nombre ?? '',
        r.administrador_email ?? '',
        r.administrador_celular ?? '',
        r.instruccion_reporte ?? '',
        r.observacion ?? '',
        r.extras ?? '',
        r.coordenadas ?? '',
      ].map(esc).join(',')),
    ]

    const csv = '﻿' + lines.join(CRLF)
    const fecha = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="netdesk_maestro_tiendas_${fecha}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('[tiendas/export]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
