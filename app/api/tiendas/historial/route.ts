import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendasHistorial, tiendas, usuarios } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tiendaId = req.nextUrl.searchParams.get('tiendaId')

  if (tiendaId) {
    const data = await db.select({
      id: tiendasHistorial.id,
      tiendaId: tiendasHistorial.tiendaId,
      tiendaCodigo: tiendas.codigo,
      tiendaNombre: tiendas.nombreCc,
      usuarioNombre: usuarios.nombre,
      campoEditado: tiendasHistorial.campoEditado,
      valorAnterior: tiendasHistorial.valorAnterior,
      valorNuevo: tiendasHistorial.valorNuevo,
      editadoEn: tiendasHistorial.editadoEn,
    })
      .from(tiendasHistorial)
      .leftJoin(tiendas, eq(tiendasHistorial.tiendaId, tiendas.id))
      .leftJoin(usuarios, eq(tiendasHistorial.usuarioId, usuarios.id))
      .where(eq(tiendasHistorial.tiendaId, tiendaId))
      .orderBy(desc(tiendasHistorial.editadoEn))
      .limit(30)
    return NextResponse.json(data)
  }

  const data = await db.select({
    id: tiendasHistorial.id,
    tiendaId: tiendasHistorial.tiendaId,
    tiendaCodigo: tiendas.codigo,
    tiendaNombre: tiendas.nombreCc,
    usuarioNombre: usuarios.nombre,
    campoEditado: tiendasHistorial.campoEditado,
    valorAnterior: tiendasHistorial.valorAnterior,
    valorNuevo: tiendasHistorial.valorNuevo,
    editadoEn: tiendasHistorial.editadoEn,
  })
    .from(tiendasHistorial)
    .leftJoin(tiendas, eq(tiendasHistorial.tiendaId, tiendas.id))
    .leftJoin(usuarios, eq(tiendasHistorial.usuarioId, usuarios.id))
    .orderBy(desc(tiendasHistorial.editadoEn))
    .limit(50)
  return NextResponse.json(data)
}
