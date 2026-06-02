import type { DefaultSession } from 'next-auth'

type Rol = 'AGENTE' | 'SUPERVISOR' | 'GERENCIA' | 'INFRAESTRUCTURA'

declare module 'next-auth' {
  interface Session {
    user: {
      id:       string
      rol:      Rol
      permisos: string[] | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?:      string
    rol?:     Rol
    permisos?: string[] | null
  }
}
