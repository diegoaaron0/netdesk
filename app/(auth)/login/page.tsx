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

// Logo animado — barra chart estilo NetDesk
function NetDeskLogo({ size = 64 }: { size?: number }) {
  const bars = [
    { x: 0,    h: 0.45, delay: '0s'    },
    { x: 0.22, h: 0.68, delay: '0.08s' },
    { x: 0.44, h: 1.00, delay: '0.16s' },
    { x: 0.66, h: 0.75, delay: '0.24s' },
    { x: 0.88, h: 0.38, delay: '0.32s' },
  ]
  const w = size
  const h = size
  return (
    <svg width={w} height={h} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e6fb5"/>
          <stop offset="100%" stopColor="#38bdf8"/>
        </linearGradient>
      </defs>
      {bars.map((b, i) => {
        const bw = 14
        const bh = b.h * 80
        const bx = b.x * 86 + 2
        const by = 98 - bh
        return (
          <rect key={i} x={bx} y={by} width={bw} height={bh}
            rx="3" fill="url(#barGrad)" opacity="0.9"
            style={{
              transformOrigin: `${bx + bw / 2}px 98px`,
              animation: `barUp 0.6s ${b.delay} cubic-bezier(.22,.68,0,1.2) both`,
            }}
          />
        )
      })}
      <style>{`
        @keyframes barUp {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 0.9; }
        }
      `}</style>
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [phase, setPhase]       = useState<'splash' | 'login'>('splash')
  const [visible, setVisible]   = useState(true)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch('/api/usuarios/publico').then(r => r.json()).then(setUsuarios)
  }, [])

  function enterLogin() {
    setVisible(false)
    setTimeout(() => { setPhase('login'); setVisible(true) }, 280)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email: selected.email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Contraseña incorrecta')
    } else {
      router.push('/incidentes')
    }
  }

  const fadeStyle: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(12px)',
    transition: 'opacity 0.28s ease, transform 0.28s ease',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 60% 40%, #0d1f3c 0%, #060d1a 60%, #0d1117 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Partículas decorativas */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[...Array(18)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px`,
            borderRadius: '50%',
            background: `rgba(56,189,248,${0.08 + (i % 4) * 0.04})`,
            left: `${(i * 37 + 5) % 95}%`,
            top: `${(i * 53 + 10) % 90}%`,
            animation: `float ${4 + (i % 3)}s ${(i * 0.4).toFixed(1)}s ease-in-out infinite alternate`,
          }} />
        ))}
        <style>{`
          @keyframes float {
            from { transform: translateY(0px) scale(1); }
            to   { transform: translateY(-12px) scale(1.15); }
          }
        `}</style>
      </div>

      {/* ── FASE SPLASH ── */}
      {phase === 'splash' && (
        <div
          onClick={enterLogin}
          style={{ ...fadeStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', userSelect: 'none', gap: '0' }}
        >
          <div style={{ marginBottom: '20px' }}>
            <NetDeskLogo size={96} />
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Service Desk
          </div>
          <div style={{ fontSize: '48px', fontWeight: 700, color: 'white', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '8px' }}>
            NetDesk
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(56,189,248,0.7)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '40px' }}>
            Monitoreo Footloose Perú
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '12px', color: 'rgba(255,255,255,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px', padding: '8px 20px',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(56,189,248,0.6)', display: 'inline-block', animation: 'blink 1.4s ease-in-out infinite' }} />
            Toca para ingresar
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.7; } 50% { opacity: 1; }
            }
            @keyframes blink {
              0%, 100% { opacity: 0.4; } 50% { opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* ── FASE LOGIN ── */}
      {phase === 'login' && (
        <div style={{ ...fadeStyle, width: '100%', maxWidth: '520px' }}>
          <div style={{ marginBottom: '28px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '6px' }}>
              <NetDeskLogo size={36} />
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'white', letterSpacing: '-0.03em', lineHeight: 1 }}>NetDesk</div>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(56,189,248,0.6)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Monitoreo Footloose Perú</div>
          </div>

          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '14px', textAlign: 'center' }}>
            Selecciona tu usuario
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
            {usuarios.map(u => (
              <button key={u.id} onClick={() => { setSelected(u); setPassword(''); setError('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '10px',
                  background: selected?.id === u.id ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                  border: selected?.id === u.id ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(255,255,255,0.07)',
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { if (selected?.id !== u.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (selected?.id !== u.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56,189,248,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'rgba(147,197,253,0.9)', flexShrink: 0 }}>
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
                type="password" autoFocus
                placeholder="Contraseña"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
              />
              {error && <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '10px' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={() => setSelected(null)}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !password}
                  style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 500, background: loading || !password ? 'rgba(56,189,248,0.2)' : 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading || !password ? 'default' : 'pointer' }}>
                  {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button onClick={() => { setPhase('splash'); setSelected(null); setError('') }}
              style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Volver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
