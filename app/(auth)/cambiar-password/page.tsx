import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'
import CambiarPasswordForm from './CambiarPasswordForm'

export default async function CambiarPasswordPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProviderWrapper session={session}>
      <CambiarPasswordForm />
    </SessionProviderWrapper>
  )
}
