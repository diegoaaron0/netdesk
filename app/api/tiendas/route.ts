import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, nivelesEscalamiento } from '@/drizzle/schema'
import { ilike, or, eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])

  const pattern = `%${q}%`
  const rows = await db.select({
    id: tiendas.id,
    codigo: tiendas.codigo,
    nombreCc: tiendas.nombreCc,
    formato: tiendas.formato,
    direccion: tiendas.direccion,
    distrito: tiendas.distrito,
    tipoConexion: tiendas.tipoConexion,
    cidServicio: tiendas.cidServicio,
    instruccionReporte: tiendas.instruccionReporte,
    proveedorId: tiendas.proveedorId,
  })
    .from(tiendas)
    .where(or(ilike(tiendas.codigo, pattern), ilike(tiendas.nombreCc, pattern)))
    .limit(8)

  const result = await Promise.all(rows.map(async t => {
    let proveedor = null
    if (t.proveedorId) {
      const [p] = await db.select({
        nombre: proveedores.nombre,
        instruccionGeneral: proveedores.instruccionGeneral,
        telefonoSoporte: proveedores.telefonoSoporte,
        correoSoporte: proveedores.correoSoporte,
      }).from(proveedores).where(eq(proveedores.id, t.proveedorId))

      const niveles = await db.select({
        id: nivelesEscalamiento.id,
        nivel: nivelesEscalamiento.nivel,
        nombreContacto: nivelesEscalamiento.nombreContacto,
        email: nivelesEscalamiento.email,
        celular: nivelesEscalamiento.celular,
        tiempoRespSev1: nivelesEscalamiento.tiempoRespSev1,
      }).from(nivelesEscalamiento)
        .where(eq(nivelesEscalamiento.proveedorId, t.proveedorId))

      proveedor = p ? { ...p, niveles } : null
    }
    return { ...t, proveedor }
  }))

  return NextResponse.json(result)
}
