'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { getPermisos } from '@/lib/permisos'
import MapaPeruRed from '@/components/brand/MapaPeruRed'
import { IsotipoNetDesk } from '@/components/brand/LogoNetDesk'

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
const IcoProveedores = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
)
const IcoDecisiones = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <polyline points="9 15 11 17 15 13"/>
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
      { href: '/incidentes', label: 'Incidentes', icon: <IcoIncidentes />, color: '#60a5fa', permiso: 'incidentes.ver' },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { href: '/dashboard',  label: 'Dashboard',  icon: <IcoDashboard />,    color: '#34d399', permiso: 'dashboard.ver' },
      { href: '/reportes',   label: 'Reportes',   icon: <IcoReportes />,     color: '#a78bfa', permiso: 'reportes.ver' },
      { href: '/gestion-cambios', label: 'Gestión de Cambios', icon: <IcoDecisiones />, color: '#fbbf24', permiso: 'gestion-cambios.ver' },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { href: '/tiendas',      label: 'Tiendas',      icon: <IcoMantenimiento />, color: '#fb923c', permiso: 'mantenimiento.ver' },
      { href: '/proveedores',  label: 'Proveedores',  icon: <IcoProveedores />,   color: '#22d3ee', permiso: 'proveedores.ver' },
      { href: '/usuarios',     label: 'Usuarios',     icon: <IcoUsuarios />,      color: '#c084fc', permiso: 'usuarios.ver' },
    ],
  },
]

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
}

const pieBoton: React.CSSProperties = {
  flex: 1, padding: '7px 0', fontSize: '11px',
  color: 'var(--muted-foreground)', background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'color var(--t) var(--ease), border-color var(--t) var(--ease), background var(--t) var(--ease)',
}

function aplicarHoverPie(el: HTMLElement, dentro: boolean) {
  el.style.color = dentro ? 'var(--foreground)' : 'var(--muted-foreground)'
  el.style.borderColor = dentro ? 'var(--border-strong)' : 'var(--border)'
  el.style.background = dentro ? 'var(--surface-3)' : 'var(--surface-2)'
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
    <aside style={{
      width: '208px', height: '100vh', background: 'var(--sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      position: 'fixed', top: 0, left: 0, zIndex: 50, overflowY: 'auto',
    }}>
      {/* Mapa como marca de agua al pie — da profundidad sin competir con el menú */}
      <div aria-hidden style={{
        position: 'absolute', bottom: '104px', left: '50%', transform: 'translateX(-50%)',
        opacity: 0.20, pointerEvents: 'none', zIndex: 0,
      }}>
        <MapaPeruRed ancho={150} intensidad="fondo" />
      </div>

      {/* Logo */}
      <div style={{ padding: '18px 16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
        <IsotipoNetDesk size={26} id="sb" />
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Net<span className="nd-gradient-text">Desk</span>
          </div>
          <div style={{ fontSize: '8px', color: 'var(--faint-foreground)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '3px' }}>Footloose Perú</div>
        </div>
      </div>

      <nav style={{ padding: '8px 0', flex: 1, position: 'relative', zIndex: 1 }}>
        {NAV.map(group => (
          <div key={group.section}>
            <div style={{ fontSize: '9px', color: 'var(--faint-foreground)', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '12px 18px 4px' }}>
              {group.section}
            </div>
            {group.items.filter(item => permisos.includes(item.permiso)).map(item => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    margin: '2px 10px', padding: '9px 12px',
                    fontSize: '12.5px', fontWeight: active ? 600 : 400,
                    color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                    background: active
                      ? `linear-gradient(90deg, ${item.color}22 0%, transparent 92%)`
                      : 'transparent',
                    borderRadius: 'var(--radius)', textDecoration: 'none',
                    transition: 'background var(--t) var(--ease), color var(--t) var(--ease)',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--foreground)' } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)' } }}
                >
                  {/* Barrita de acento del ítem activo */}
                  {active && (
                    <span style={{
                      position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)',
                      width: '3px', height: '20px', borderRadius: '0 3px 3px 0',
                      background: item.color, boxShadow: `0 0 10px ${item.color}`,
                    }} />
                  )}
                  <span style={{ color: active ? item.color : 'var(--faint-foreground)', flexShrink: 0, display: 'flex' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Pie: usuario */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: '#fff',
          }}>
            {initials(userName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11.5px', color: 'var(--foreground)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
            <div style={{ fontSize: '9.5px', color: 'var(--faint-foreground)' }}>
              {userRol === 'SUPERVISOR' ? 'Supervisor' : userRol === 'GERENCIA' ? 'Gerencia' : userRol === 'INFRAESTRUCTURA' ? 'Infraestructura' : 'Agente TTI'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Link href="/perfil" style={pieBoton}
            onMouseEnter={e => aplicarHoverPie(e.currentTarget, true)}
            onMouseLeave={e => aplicarHoverPie(e.currentTarget, false)}>
            Mi perfil
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{ ...pieBoton, gap: '5px' }}
            onMouseEnter={e => aplicarHoverPie(e.currentTarget, true)}
            onMouseLeave={e => aplicarHoverPie(e.currentTarget, false)}
          >
            <IcoSalir /> Salir
          </button>
        </div>
      </div>
    </aside>
  )
}
