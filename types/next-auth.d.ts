import type { DefaultSession } from 'next-auth'

type Rol = 'AGENTE' | 'SUPERVISOR' | 'GERENCIA' | 'INFRAESTRUCTURA' | 'DEMO'

declare module 'next-auth' {
  interface Session {
    user: {
      id:       string
      rol:      Rol
      permisos: string[] | null
      debeCambiarPassword: boolean
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?:      string
    rol?:     Rol
    permisos?: string[] | null
    debeCambiarPassword?: boolean
  }
}
