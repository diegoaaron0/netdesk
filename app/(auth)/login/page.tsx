'use client'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const ROL_LABEL: Record<string, string> = {
  AGENTE: 'Agente TTI',
  SUPERVISOR: 'Supervisor',
  GERENCIA: 'Gerencia',
  INFRAESTRUCTURA: 'Infraestructura',
}

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function LoginPage() {
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/usuarios/publico').then(r => r.json()).then(setUsuarios)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      email: selected.email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError('Contraseña incorrecta')
    } else {
      router.push('/incidentes')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Service Desk</div>
        <div style={{ fontSize: '28px', fontWeight: 500, color: 'white', letterSpacing: '-0.03em', marginTop: '2px' }}>NetDesk</div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '3px' }}>Footloose Perú</div>
      </div>

      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '14px', textAlign: 'center' }}>
          Selecciona tu usuario
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
          {usuarios.map(u => (
            <button key={u.id} onClick={() => { setSelected(u); setPassword(''); setError('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '10px',
                background: selected?.id === u.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                border: selected?.id === u.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.07)',
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { if (selected?.id !== u.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (selected?.id !== u.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59,130,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'rgba(147,197,253,0.9)', flexShrink: 0 }}>
                {initials(u.nombre)}
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{u.nombre}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{ROL_LABEL[u.rol] ?? u.rol}</div>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <form onSubmit={handleLogin}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>
              Ingresando como <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{selected.nombre}</span>
            </div>

            <input
              type="password"
              autoFocus
              placeholder="Contraseña"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
            />

            {error && (
              <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '10px' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button type="button" onClick={() => setSelected(null)}
                style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={loading || !password}
                style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 500, background: loading || !password ? 'rgba(59,130,246,0.3)' : 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading || !password ? 'default' : 'pointer' }}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
