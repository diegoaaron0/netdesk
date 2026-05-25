import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

function trim(v: any): string { return (v ?? '').toString().trim() }

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes(rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const rows: any[] = body.rows ?? []
  if (rows.length === 0) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  // Build proveedor name → id map
  const provList = await db.select({ id: proveedores.id, nombre: proveedores.nombre }).from(proveedores)
  const provMap = new Map<string, string>()
  for (const p of provList) {
    provMap.set(p.nombre.toUpperCase(), p.id)
    // Common aliases
    if (p.nombre.toUpperCase() === 'GTD PERU') provMap.set('GTD', p.id)
    if (p.nombre.toUpperCase() === 'DIT SAC') provMap.set('DITSAC', p.id)
  }

  // Build existing tiendas map: CODIGO → id
  const existingList = await db.select({ id: tiendas.id, codigo: tiendas.codigo }).from(tiendas)
  const existingMap = new Map<string, string>()
  for (const e of existingList) existingMap.set(e.codigo.toUpperCase(), e.id)

  let created = 0, updated = 0, skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const codigo = trim(row.codigo).toUpperCase()
    if (!codigo) { skipped++; continue }

    const provName = trim(row.proveedor).toUpperCase()
    const resolvedProvId = provName ? (provMap.get(provName) ?? undefined) : undefined
    if (provName && resolvedProvId === undefined) {
      errors.push(`Proveedor no encontrado: "${trim(row.proveedor)}" — tienda ${codigo}`)
    }

    const existingId = existingMap.get(codigo)

    try {
      if (existingId) {
        // For existing stores, only update fields present in the CSV row
        const upd: Record<string, any> = {}
        if (trim(row.nombre_cc))            upd.nombreCc             = trim(row.nombre_cc)
        if (trim(row.direccion))            upd.direccion            = trim(row.direccion)
        if (trim(row.distrito))             upd.distrito             = trim(row.distrito)
        if (trim(row.provincia))            upd.provincia            = trim(row.provincia)
        if (trim(row.supervisor_nombre))    upd.supervisorNombre     = trim(row.supervisor_nombre)
        if (trim(row.administrador_nombre)) upd.administradorNombre  = trim(row.administrador_nombre)
        if (trim(row.administrador_email))  upd.administradorEmail   = trim(row.administrador_email)
        if (trim(row.contacto_soporte))     upd.administradorCelular = trim(row.contacto_soporte)
        if (trim(row.telefono_fijo))        upd.contactoSoporte      = trim(row.telefono_fijo)
        if (trim(row.tipo_conexion))        upd.tipoConexion         = trim(row.tipo_conexion)
        if (resolvedProvId !== undefined)   upd.proveedorId          = resolvedProvId

        if (Object.keys(upd).length > 0) {
          await db.update(tiendas).set(upd).where(eq(tiendas.id, existingId))
        }
        updated++
      } else {
        await db.insert(tiendas).values({
          codigo,
          nombreCc:             trim(row.nombre_cc)            || null,
          direccion:            trim(row.direccion)            || null,
          distrito:             trim(row.distrito)             || null,
          provincia:            trim(row.provincia)            || null,
          supervisorNombre:     trim(row.supervisor_nombre)    || null,
          administradorNombre:  trim(row.administrador_nombre) || null,
          administradorEmail:   trim(row.administrador_email)  || null,
          administradorCelular: trim(row.contacto_soporte)    || null,
          contactoSoporte:      trim(row.telefono_fijo)        || null,
          tipoConexion:         trim(row.tipo_conexion)        || null,
          proveedorId:          resolvedProvId ?? null,
        })
        created++
      }
    } catch (e: any) {
      errors.push(`Error tienda ${codigo}: ${e.message}`)
      skipped++
    }
  }

  return NextResponse.json({ created, updated, skipped, errors })
}
