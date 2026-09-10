'use client'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function CambiarPasswordForm() {
  const router = useRouter()
  const { data: session, update } = useSession()
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva]   = useState('')
  const [confirmar, setConfirmar]           = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (passwordNueva.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (passwordNueva !== confirmar) { setError('Las contraseñas nuevas no coinciden'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/usuarios/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordActual, passwordNueva }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setLoading(false)
        return
      }
      // Refresca la sesión para que debeCambiarPassword quede en false sin
      // tener que volver a loguearse (dispara auth.ts con trigger: 'update').
      await update()
      router.push('/incidentes')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 60% 40%, #0d1f3c 0%, #060d1a 60%, #0d1117 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'white', marginBottom: '6px' }}>Cambia tu contraseña</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            {session?.user?.name ? `Hola, ${session.user.name}. ` : ''}
            Por seguridad debes elegir una contraseña nueva antes de continuar.
          </div>
        </div>

        <form onSubmit={handleSubmit}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '20px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Contraseña actual
          </label>
          <input
            type="password" autoFocus autoComplete="current-password"
            value={passwordActual}
            onChange={e => { setPasswordActual(e.target.value); setError('') }}
            style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' }}
          />
          <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Contraseña nueva
          </label>
          <input
            type="password" autoComplete="new-password"
            value={passwordNueva}
            onChange={e => { setPasswordNueva(e.target.value); setError('') }}
            style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' }}
          />
          <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Confirmar contraseña nueva
          </label>
          <input
            type="password" autoComplete="new-password"
            value={confirmar}
            onChange={e => { setConfirmar(e.target.value); setError('') }}
            style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '10px' }}>{error}</div>}
          <button type="submit" disabled={loading || !passwordActual || !passwordNueva || !confirmar}
            style={{ width: '100%', marginTop: '8px', padding: '9px', fontSize: '12px', fontWeight: 500, background: loading || !passwordActual || !passwordNueva || !confirmar ? 'rgba(56,189,248,0.2)' : 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
          <button type="button" onClick={() => signOut({ callbackUrl: '/login' })}
            style={{ width: '100%', marginTop: '10px', padding: '7px', fontSize: '11px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
