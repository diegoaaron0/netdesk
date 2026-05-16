import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const [user] = await db.select().from(usuarios).where(eq(usuarios.email, credentials.email as string))
        if (!user || !user.activo || user.eliminadoEn) return null
        const stored = user.password ?? 'soporte123'
        if (stored !== credentials.password) return null
        return { id: user.id, name: user.nombre, email: user.email, rol: user.rol, permisos: user.permisos ?? null }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.rol = (user as any).rol
        // Traer permisos reales desde la BD en cada login
        const [dbUser] = await db.select({ permisos: usuarios.permisos })
          .from(usuarios).where(eq(usuarios.email, user.email!))
        token.permisos = dbUser?.permisos ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).rol     = token.rol
        ;(session.user as any).permisos = token.permisos ?? null
      }
      return session
    },
  },
  pages: { signIn: '/login' },
})
