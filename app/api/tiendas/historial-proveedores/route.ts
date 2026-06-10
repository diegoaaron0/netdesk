import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendasHistorial, proveedores, usuarios } from '@/drizzle/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tiendaId = req.nextUrl.searchParams.get('tiendaId')
  if (!tiendaId) return NextResponse.json({ error: 'tiendaId requerido' }, { status: 400 })

  const rows = await db
    .select({
      id:            tiendasHistorial.id,
      usuarioId:     tiendasHistorial.usuarioId,
      usuarioNombre: usuarios.nombre,
      valorAnterior: tiendasHistorial.valorAnterior,
      valorNuevo:    tiendasHistorial.valorNuevo,
      editadoEn:     tiendasHistorial.editadoEn,
    })
    .from(tiendasHistorial)
    .leftJoin(usuarios, eq(tiendasHistorial.usuarioId, usuarios.id))
    .where(and(
      eq(tiendasHistorial.tiendaId, tiendaId),
      eq(tiendasHistorial.campoEditado, 'proveedor_id'),
    ))
    .orderBy(desc(tiendasHistorial.editadoEn))
    .limit(20)

  if (rows.length === 0) return NextResponse.json([])

  // Recolectar UUIDs de proveedores para resolverlos a nombres
  const uuids = new Set<string>()
  for (const r of rows) {
    if (r.valorAnterior && /^[0-9a-f-]{36}$/i.test(r.valorAnterior.trim())) {
      uuids.add(r.valorAnterior.trim())
    }
    if (r.valorNuevo) {
      const uuid = r.valorNuevo.split(' — vía ')[0].trim()
      if (/^[0-9a-f-]{36}$/i.test(uuid)) uuids.add(uuid)
    }
  }

  const provRows = uuids.size > 0
    ? await db.select({ id: proveedores.id, nombre: proveedores.nombre })
        .from(proveedores)
        .where(inArray(proveedores.id, [...uuids]))
    : []
  const provMap: Record<string, string> = Object.fromEntries(provRows.map(p => [p.id, p.nombre]))

  const result = rows.map(r => {
    const anteriorNombre = r.valorAnterior ? (provMap[r.valorAnterior.trim()] ?? null) : null

    const parts = (r.valorNuevo ?? '').split(' — vía ')
    const nuevoUuid = parts[0].trim()
    const via = parts.slice(1).join(' — vía ').trim() || null
    const nuevoNombre = provMap[nuevoUuid] ?? null

    return {
      id:            r.id,
      editadoEn:     r.editadoEn,
      usuarioNombre: r.usuarioNombre,
      anteriorNombre,
      nuevoNombre,
      via,
    }
  })

  return NextResponse.json(result)
}
