'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { LogoNetDesk, IsotipoNetDesk } from '@/components/brand/LogoNetDesk'

const IcoCorreo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
)
const IcoCandado = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const IcoOjo = ({ tachado }: { tachado: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    {tachado && <line x1="3" y1="21" x2="21" y2="3" />}
  </svg>
)
const IcoFlecha = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const campoWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  background: 'rgba(255,255,255,0.045)',
  border: '1px solid var(--input)',
  borderRadius: 'var(--radius-md)',
  padding: '0 14px',
  transition: 'border-color var(--t) var(--ease), box-shadow var(--t) var(--ease)',
}

const campoInput: React.CSSProperties = {
  flex: 1, background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--foreground)', fontSize: '14px', padding: '15px 0',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [foco, setFoco]         = useState<'email' | 'pass' | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) setError('Correo o contraseña incorrectos')
    else router.push('/incidentes')
  }

  const borde = (activo: boolean) => ({
    ...campoWrap,
    borderColor: error ? 'var(--danger-border)' : activo ? 'rgba(79,125,251,0.55)' : 'var(--input)',
    boxShadow: activo && !error ? '0 0 0 3px rgba(79,125,251,0.12)' : 'none',
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 90% 70% at 22% 42%, #10214d 0%, #0a1130 42%, var(--bg-deep) 100%)',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Manchas de color en las esquinas, muy difusas */}
      <div aria-hidden style={{ position: 'absolute', top: '-18%', left: '-12%', width: '46vw', height: '46vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,245,0.16) 0%, transparent 68%)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: '-24%', left: '4%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 68%)', pointerEvents: 'none' }} />

      {/* Partículas */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} style={{
            position: 'absolute',
            width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px`,
            borderRadius: '50%',
            background: `rgba(125,211,252,${0.10 + (i % 4) * 0.05})`,
            left: `${(i * 37 + 5) % 96}%`,
            top: `${(i * 53 + 9) % 92}%`,
            animation: `nd-float ${4 + (i % 4)}s ${(i * 0.35).toFixed(1)}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>

      {/* ══ Izquierda: marca + mapa ══ */}
      <section style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '18px', padding: '40px 20px 40px 48px', minWidth: 0,
      }}>
        <div className="nd-fade-up" style={{ flexShrink: 0, maxWidth: '300px' }}>
          {/* El isotipo va a 78px para que su altura (0.7 del ancho) iguale la
              altura de la palabra a 54px y lean como una sola unidad. */}
          <LogoNetDesk size={78} wordSize={54} sub="Monitoreo Footloose Perú" id="login" />
          <div style={{ width: '64px', height: '3px', borderRadius: '99px', background: 'var(--gradient-brand)', margin: '28px 0 20px' }} />
          <p style={{ fontSize: '19px', lineHeight: 1.5, color: 'var(--muted-foreground)', margin: 0, fontWeight: 300 }}>
            Conectividad que<br />impulsa nuestras tiendas.
          </p>
        </div>

        {/* Mapa: <img> suelto, sin contenedor con caja. El PNG ya trae alpha,
            así que no necesita fondo ni borde — sólo opacidad y glow para que
            respire contra el navy en vez de verse pegado encima. */}
        <img
          src="/mapa-peru.png"
          alt=""
          aria-hidden="true"
          className="nd-fade-up"
          style={{
            animationDelay: '120ms',
            height: '68vh',
            width: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
            opacity: 0.85,
            filter: 'drop-shadow(0 0 40px rgba(0, 100, 255, 0.3))',
            pointerEvents: 'none',
            flexShrink: 1,
            minWidth: 0,
          }}
        />
      </section>

      {/* ══ Derecha: formulario ══ */}
      <section style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 60px 48px 32px' }}>
        {/* Marca corporativa, arriba a la derecha */}
        <div style={{
          position: 'absolute', top: '34px', right: '56px',
          display: 'flex', alignItems: 'center', gap: '14px',
          fontSize: '12px', color: 'var(--faint-foreground)',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.02em' }}>Footloose</span>
          <span style={{ width: '1px', height: '16px', background: 'var(--border-strong)' }} />
          <span>Tecnología que impulsa tu negocio</span>
        </div>

        <form
          onSubmit={handleLogin}
          className="nd-fade-up"
          style={{
            animationDelay: '200ms',
            width: '100%', maxWidth: '430px',
            background: 'rgba(15, 23, 52, 0.62)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-xl)',
            padding: '44px 40px 34px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
            <IsotipoNetDesk size={54} id="form" />
          </div>

          <h1 style={{ fontSize: '25px', fontWeight: 700, textAlign: 'center', margin: '0 0 30px', letterSpacing: '-0.01em' }}>
            Bienvenido a <span className="nd-gradient-text">NetDesk</span>
          </h1>

          <div style={{ ...borde(foco === 'email'), marginBottom: '14px' }}>
            <span style={{ color: 'var(--faint-foreground)', display: 'flex' }}><IcoCorreo /></span>
            <input
              type="email" autoFocus autoComplete="username"
              placeholder="Correo corporativo"
              value={email}
              onFocus={() => setFoco('email')} onBlur={() => setFoco(null)}
              onChange={e => { setEmail(e.target.value); setError('') }}
              style={campoInput}
            />
          </div>

          <div style={borde(foco === 'pass')}>
            <span style={{ color: 'var(--faint-foreground)', display: 'flex' }}><IcoCandado /></span>
            <input
              type={verPass ? 'text' : 'password'} autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onFocus={() => setFoco('pass')} onBlur={() => setFoco(null)}
              onChange={e => { setPassword(e.target.value); setError('') }}
              style={campoInput}
            />
            <button
              type="button" onClick={() => setVerPass(v => !v)}
              aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint-foreground)', display: 'flex', padding: 0 }}
            >
              <IcoOjo tachado={!verPass} />
            </button>
          </div>

          <div style={{ minHeight: '22px', paddingTop: '8px' }}>
            {error && <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</div>}
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="nd-btn-primary"
            style={{
              width: '100%', padding: '15px', fontSize: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              marginTop: '6px',
            }}
          >
            {loading ? 'Ingresando…' : <><IcoFlecha /> Ingresar</>}
          </button>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: '26px', paddingTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }} className="nd-blink" />
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Sistema en línea</span>
          </div>
        </form>
      </section>

      {/* En pantallas angostas el mapa se va y queda solo el formulario. */}
      <style>{`
        @media (max-width: 1080px) {
          section:first-of-type { display: none !important; }
          div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
