'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { getPermisos } from '@/lib/permisos'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoIncidentes = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IcoDashboard = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const IcoReportes = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
    <line x1="8" y1="9"  x2="10" y2="9"/>
  </svg>
)
const IcoMantenimiento = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
)
const IcoUsuarios = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IcoSalir = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

const NAV = [
  {
    section: 'Operación',
    items: [
      { href: '/incidentes', label: 'Incidentes', icon: <IcoIncidentes />, color: '#378ADD', permiso: 'incidentes.ver' },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <IcoDashboard />,    color: '#1D9E75', permiso: 'dashboard.ver' },
      { href: '/reportes',  label: 'Reportes',  icon: <IcoReportes />,     color: '#7F77DD', permiso: 'reportes.ver' },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { href: '/tiendas', label: 'Tiendas', icon: <IcoMantenimiento />, color: '#F59E0B', permiso: 'mantenimiento.ver' },
      { href: '/usuarios',      label: 'Usuarios',      icon: <IcoUsuarios />,      color: '#A78BFA', permiso: 'usuarios.ver' },
    ],
  },
]

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
}

// Mini bar-chart logo
function LogoIcon() {
  return (
    <svg width="22" height="20" viewBox="0 0 55 50" fill="none">
      <defs>
        <linearGradient id="sidebarGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e6fb5"/>
          <stop offset="100%" stopColor="#38bdf8"/>
        </linearGradient>
      </defs>
      {[
        { x: 0,  h: 22 },
        { x: 11, h: 34 },
        { x: 22, h: 50 },
        { x: 33, h: 38 },
        { x: 44, h: 19 },
      ].map((b, i) => (
        <rect key={i} x={b.x} y={50 - b.h} width={9} height={b.h} rx="2" fill="url(#sidebarGrad)" opacity="0.9" />
      ))}
    </svg>
  )
}

export default function Sidebar({ serverRol, serverName }: { serverRol?: string; serverName?: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userRol  = serverRol ?? (session?.user as any)?.rol ?? 'AGENTE'
  const userName = serverName ?? session?.user?.name ?? ''
  const permisos = getPermisos(session)

  // Mark incidentes active if on incidentes/* (but not subdash routes)
  function isActive(href: string) {
    if (href === '/incidentes') return pathname === '/incidentes' || pathname.startsWith('/incidentes/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside style={{ width: '192px', height: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, zIndex: 50, overflowY: 'auto' }}>
      {/* Logo */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '9px' }}>
        <LogoIcon />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>NetDesk</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '2px' }}>Footloose Perú</div>
        </div>
      </div>

      <nav style={{ padding: '8px 0', flex: 1 }}>
        {NAV.map(group => (
          <div key={group.section}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 16px 3px' }}>
              {group.section}
            </div>
            {group.items.filter(item => permisos.includes(item.permiso)).map(item => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: '9px',
                  margin: '1px 8px', padding: '7px 10px',
                  fontSize: '12px',
                  color: active ? 'white' : 'rgba(255,255,255,0.42)',
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  borderRadius: '7px', textDecoration: 'none',
                  borderLeft: active ? `2px solid ${item.color}` : '2px solid transparent',
                }}>
                  <span style={{ color: active ? item.color : 'rgba(255,255,255,0.35)', flexShrink: 0, display: 'flex' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: '10px 14px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(56,189,248,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 500, color: 'rgba(147,197,253,0.9)', flexShrink: 0 }}>
            {initials(userName)}
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{userName}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
              {userRol === 'SUPERVISOR' ? 'Supervisor' : userRol === 'GERENCIA' ? 'Gerencia' : userRol === 'INFRAESTRUCTURA' ? 'Infraestructura' : 'Agente TTI'}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ width: '100%', padding: '6px 0', fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
        >
          <IcoSalir /> Salir
        </button>
      </div>
    </aside>
  )
}
