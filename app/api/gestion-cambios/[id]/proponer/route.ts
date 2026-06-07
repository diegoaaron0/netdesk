import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail } from '@/lib/mailer'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [current] = await db.select({ estado: accionesGestion.estado, titulo: accionesGestion.titulo })
    .from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'BORRADOR')
    return NextResponse.json({ error: 'Solo se puede proponer desde BORRADOR' }, { status: 409 })

  const [updated] = await db.update(accionesGestion)
    .set({ estado: 'PROPUESTO', actualizadoEn: new Date() })
    .where(eq(accionesGestion.id, id))
    .returning()

  // Notificar a gerencia
  try {
    const gerentes = await db.select({ email: usuarios.email, nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.rol, 'GERENCIA'))
    for (const g of gerentes) {
      if (g.email) {
        sendMail({
          to: g.email,
          subject: `📋 Nueva acción propuesta: ${current.titulo} — NetDesk`,
          text: `Se ha registrado una nueva acción en Gestión de Cambios que requiere tu aprobación.\n\nAcción: ${current.titulo}\n\nIngresa a NetDesk > Gestión de Cambios para revisarla.`,
        }).catch(() => {})
      }
    }
  } catch { /* mail no crítico */ }

  return NextResponse.json(updated)
}
