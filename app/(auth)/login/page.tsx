'use client'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'

interface Usuario {
  id: string
  nombre: string
  email: string
  rol: string
}

export default function LoginPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/usuarios').then(r => r.json()).then(setUsuarios)
  }, [])

  const handleLogin = async (email: string) => {
    setLoading(true)
    await signIn('credentials', { email, redirect: true, callbackUrl: '/incidentes' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', width: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '9px', color: '#999', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Service Desk</div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#0d1117', letterSpacing: '-0.03em', marginTop: '2px' }}>NetDesk</div>
          <div style={{ fontSize: '9px', color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>Footloose Perú</div>
        </div>

        <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
          Selecciona tu usuario para ingresar
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {usuarios.map(u => (
            <button
              key={u.id}
              onClick={() => handleLogin(u.email)}
              disabled={loading}
              style={{
                width: '100%', padding: '10px 14px', textAlign: 'left',
                background: 'hsl(0,0%,97%)', border: '0.5px solid hsl(0,0%,88%)',
                borderRadius: '8px', cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'hsl(0,0%,93%)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'hsl(0,0%,97%)' }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{u.nombre}</div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>{u.email}</div>
              </div>
              <div style={{
                fontSize: '9px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px',
                background: u.rol === 'SUPERVISOR' ? '#E6F1FB' : u.rol === 'GERENCIA' ? '#EAF3DE' : '#F1EFE8',
                color: u.rol === 'SUPERVISOR' ? '#185FA5' : u.rol === 'GERENCIA' ? '#27500A' : '#444441',
              }}>
                {u.rol}
              </div>
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: '#999' }}>
            Ingresando...
          </div>
        )}
      </div>
    </div>
  )
}
