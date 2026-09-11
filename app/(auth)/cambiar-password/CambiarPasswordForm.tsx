'use client'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import MapaPeruRed from '@/components/brand/MapaPeruRed'
import { IsotipoNetDesk } from '@/components/brand/LogoNetDesk'

const inputEstilo = (hayError: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px 14px', fontSize: '14px',
  border: `1px solid ${hayError ? 'var(--danger-border)' : 'var(--input)'}`,
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.045)', color: 'var(--foreground)',
  outline: 'none', marginBottom: '14px', boxSizing: 'border-box',
})

export default function CambiarPasswordForm() {
  const { data: session } = useSession()
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
      // La contraseña con la que se inició esta sesión ya no es válida, así que
      // se cierra y se vuelve al login para entrar con la nueva. signOut ya
      // redirige a callbackUrl — no hace falta un click extra ni router.push.
      await signOut({ callbackUrl: '/login' })
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 60% at 50% 34%, #10214d 0%, #0a1130 45%, var(--bg-deep) 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.13, pointerEvents: 'none' }}>
        <MapaPeruRed ancho={380} intensidad="fondo" />
      </div>

      <div className="nd-fade-up" style={{ width: '100%', maxWidth: '430px', position: 'relative' }}>
        <div style={{ marginBottom: '22px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <IsotipoNetDesk size={46} id="cp" />
          </div>
          <div style={{ fontSize: '23px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '8px', letterSpacing: '-0.01em' }}>Cambia tu contraseña</div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
            {session?.user?.name ? `Hola, ${session.user.name}. ` : ''}
            Por seguridad debes elegir una contraseña nueva antes de continuar.
          </div>
        </div>

        <form onSubmit={handleSubmit}
          style={{
            background: 'rgba(15, 23, 52, 0.62)',
            backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-xl)', padding: '30px 28px 24px',
            boxShadow: 'var(--shadow-lg)',
          }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--faint-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
            Contraseña actual
          </label>
          <input
            type="password" autoFocus autoComplete="current-password"
            value={passwordActual}
            onChange={e => { setPasswordActual(e.target.value); setError('') }}
            style={inputEstilo(false)}
          />
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--faint-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
            Contraseña nueva
          </label>
          <input
            type="password" autoComplete="new-password"
            value={passwordNueva}
            onChange={e => { setPasswordNueva(e.target.value); setError('') }}
            style={inputEstilo(false)}
          />
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--faint-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
            Confirmar contraseña nueva
          </label>
          <input
            type="password" autoComplete="new-password"
            value={confirmar}
            onChange={e => { setConfirmar(e.target.value); setError('') }}
            style={inputEstilo(!!error)}
          />
          {error && <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '10px' }}>{error}</div>}
          <button type="submit" disabled={loading || !passwordActual || !passwordNueva || !confirmar}
            className="nd-btn-primary" style={{ width: '100%', marginTop: '10px', padding: '13px', fontSize: '14px' }}>
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
          <button type="button" onClick={() => signOut({ callbackUrl: '/login' })}
            style={{ width: '100%', marginTop: '14px', padding: '7px', fontSize: '12px', background: 'none', border: 'none', color: 'var(--faint-foreground)', cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
