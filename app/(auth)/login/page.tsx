'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Correo o contraseña incorrectos')
    } else {
      router.push('/incidentes')
    }
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

      <div style={{ width: '100%', maxWidth: '380px', position: 'relative' }}>
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '6px' }}>
            <NetDeskLogo size={36} />
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'white', letterSpacing: '-0.03em', lineHeight: 1 }}>NetDesk</div>
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(56,189,248,0.6)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Monitoreo Footloose Perú</div>
        </div>

        <form onSubmit={handleLogin}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '20px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Correo
          </label>
          <input
            type="email" autoFocus autoComplete="username"
            placeholder="tu.correo@footloose.pe"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' }}
          />
          <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Contraseña
          </label>
          <input
            type="password" autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', color: 'white', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '10px' }}>{error}</div>}
          <button type="submit" disabled={loading || !email || !password}
            style={{ width: '100%', marginTop: '8px', padding: '9px', fontSize: '12px', fontWeight: 500, background: loading || !email || !password ? 'rgba(56,189,248,0.2)' : 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading || !email || !password ? 'default' : 'pointer' }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
