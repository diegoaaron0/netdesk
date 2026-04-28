'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

const NAV = [
  {
    section: 'Operación',
    items: [
      { href: '/incidentes',       label: 'Incidentes',        dot: '#378ADD', roles: ['AGENTE','SUPERVISOR','GERENCIA','INFRAESTRUCTURA'] },
      { href: '/incidentes/nuevo', label: '+ Nuevo incidente', dot: 'rgba(255,255,255,0.15)', roles: ['AGENTE','SUPERVISOR','INFRAESTRUCTURA'] },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { href: '/dashboard', label: 'Dashboard', dot: '#1D9E75', roles: ['SUPERVISOR','GERENCIA','INFRAESTRUCTURA'] },
      { href: '/reportes',  label: 'Reportes',  dot: '#7F77DD', roles: ['SUPERVISOR','GERENCIA','INFRAESTRUCTURA'] },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { href: '/mantenimiento', label: 'Mantenimiento', dot: '#F59E0B', roles: ['AGENTE','SUPERVISOR','GERENCIA','INFRAESTRUCTURA'] },
      { href: '/usuarios',      label: 'Usuarios',      dot: '#A78BFA', roles: ['SUPERVISOR'] },
    ],
  },
]

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function Sidebar({ serverRol, serverName }: { serverRol?: string; serverName?: string }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const userRol  = serverRol ?? (session?.user as any)?.rol ?? 'AGENTE'
  const userName = serverName ?? session?.user?.name ?? ''

  console.log('[Sidebar] status:', status, '| serverRol:', serverRol, '| sessionRol:', (session?.user as any)?.rol, '| effective:', userRol)

  return (
    <aside style={{ width: '192px', height: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, zIndex: 50, overflowY: 'auto' }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Service Desk</div>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'white', letterSpacing: '-0.02em', marginTop: '1px' }}>NetDesk</div>
        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>Footloose Perú</div>
      </div>

      <nav style={{ padding: '8px 0', flex: 1 }}>
        {NAV.map(group => (
          <div key={group.section}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 16px 3px' }}>
              {group.section}
            </div>
            {group.items.filter(item => item.roles.includes(userRol)).map(item => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'block', margin: '1px 8px', padding: '6px 10px',
                  fontSize: '12px',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.42)',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderRadius: '6px', textDecoration: 'none',
                }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: item.dot, marginRight: '7px', verticalAlign: 'middle' }} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '10px 14px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(59,130,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 500, color: 'rgba(147,197,253,0.9)', flexShrink: 0 }}>
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
          style={{ width: '100%', padding: '5px 0', fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
        >
          Salir
        </button>
      </div>
    </aside>
  )
}
