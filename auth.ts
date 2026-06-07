import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',     type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const [user] = await db.select().from(usuarios).where(eq(usuarios.email, credentials.email as string))
        if (!user || !user.activo || user.eliminadoEn) return null

        const stored   = user.password ?? 'S0p0rt3!?@#'
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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.rol = (user as any).rol
        const [dbUser] = await db.select({ permisos: usuarios.permisos })
          .from(usuarios).where(eq(usuarios.email, user.email!))
        token.permisos = dbUser?.permisos ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id       = token.sub   // UUID del usuario — requerido por todas las rutas
        ;(session.user as any).nombre   = token.name
        ;(session.user as any).rol      = token.rol
        ;(session.user as any).permisos = token.permisos ?? null
      }
      return session
    },
  },
})
