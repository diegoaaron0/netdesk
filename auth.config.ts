import type { NextAuthConfig } from 'next-auth'

export default {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [],
  session: { maxAge: 8 * 60 * 60 },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id       = token.sub
        ;(session.user as any).nombre   = token.name
        ;(session.user as any).rol      = token.rol
        ;(session.user as any).permisos = token.permisos ?? null
      }
      return session
    },
  },
  pages: { signIn: '/login' },
} satisfies NextAuthConfig
