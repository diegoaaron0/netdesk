import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const serverRol  = (session.user as any)?.rol ?? 'AGENTE'
  const serverName = session.user?.name ?? ''

  return (
    <SessionProviderWrapper session={session}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar serverRol={serverRol} serverName={serverName} />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--muted)', padding: '18px' }}>
          {children}
        </main>
      </div>
    </SessionProviderWrapper>
  )
}
