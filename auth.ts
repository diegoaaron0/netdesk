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
        if (!user || !user.activo) return null
        if (user.password !== credentials.password) return null
        return { id: user.id, name: user.nombre, email: user.email, rol: user.rol }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.rol = (user as any).rol
      return token
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).rol = token.rol
      return session
    },
  },
  pages: { signIn: '/login' },
})
