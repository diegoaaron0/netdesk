import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'
import { LayoutShell } from './LayoutShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const serverRol  = (session.user as any)?.rol ?? 'AGENTE'
  const serverName = session.user?.name ?? ''

  return (
    <SessionProviderWrapper session={session}>
      <LayoutShell sidebar={<Sidebar serverRol={serverRol} serverName={serverName} />}>
        {children}
      </LayoutShell>
    </SessionProviderWrapper>
  )
}
