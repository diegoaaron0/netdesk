import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import authConfig from './auth.config'

// Extraído del provider para poder testear la lógica real de login (activo/eliminado,
// hash, migración de contraseña legada) con un import directo, sin simular el flujo
// HTTP completo de NextAuth (csrf/cookies). Mismo código, mismo orden de checks.
export async function autorizarCredenciales(credentials: Record<string, unknown> | undefined) {
  if (!credentials?.email || !credentials?.password) return null
  const [user] = await db.select().from(usuarios).where(eq(usuarios.email, credentials.email as string))
  if (!user || !user.activo || user.eliminadoEn) return null

  // Sin contraseña registrada → acceso denegado. Nunca usar un default conocido como
  // fallback de login (sería una puerta trasera: cualquiera con password NULL entraría).
  if (!user.password) return null

  const stored   = user.password
  const input    = credentials.password as string
  const isHashed = stored.startsWith('$2b$') || stored.startsWith('$2a$')

  let valid: boolean
  if (isHashed) {
    valid = await bcrypt.compare(input, stored)
  } else {
    // Contraseña legada en texto plano — comparar y migrar al hash en el mismo login
    valid = stored === input
    if (valid) {
      const hashed = await bcrypt.hash(stored, 12)
      await db.update(usuarios).set({ password: hashed }).where(eq(usuarios.id, user.id))
    }
  }

  if (!valid) return null
  return { id: user.id, name: user.nombre, email: user.email, rol: user.rol, permisos: user.permisos ?? null }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',     type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: autorizarCredenciales,
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.rol = (user as any).rol
        const [dbUser] = await db.select({ permisos: usuarios.permisos, debeCambiarPassword: usuarios.debeCambiarPassword })
          .from(usuarios).where(eq(usuarios.email, user.email!))
        token.permisos = dbUser?.permisos ?? null
        token.debeCambiarPassword = dbUser?.debeCambiarPassword ?? false
      } else if (trigger === 'update' && token.sub) {
        // Refresca el flag sin exigir volver a loguearse — se dispara desde el
        // cliente (useSession().update()) justo después de cambiar la contraseña.
        const [dbUser] = await db.select({ debeCambiarPassword: usuarios.debeCambiarPassword })
          .from(usuarios).where(eq(usuarios.id, token.sub))
        token.debeCambiarPassword = dbUser?.debeCambiarPassword ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id       = token.sub   // UUID del usuario — requerido por todas las rutas
        ;(session.user as any).nombre   = token.name
        ;(session.user as any).rol      = token.rol
        ;(session.user as any).permisos = token.permisos ?? null
        ;(session.user as any).debeCambiarPassword = token.debeCambiarPassword ?? false
      }
      return session
    },
  },
})
