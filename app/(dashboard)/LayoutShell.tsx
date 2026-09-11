'use client'
import type { ReactNode } from 'react'

const ANCHO_SIDEBAR = 208   // debe coincidir con components/layout/Sidebar.tsx

export function LayoutShell({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--muted)' }}>
      {sidebar}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          marginLeft: `${ANCHO_SIDEBAR}px`,
          padding: '20px 22px',
          position: 'relative',
          /* Dos manchas de color muy difusas arriba: dan profundidad al navy
             plano sin interferir con la lectura. `fixed` para que no se muevan
             con el scroll del contenido. */
          backgroundImage:
            'radial-gradient(ellipse 70% 45% at 12% -8%, rgba(124,92,245,0.10) 0%, transparent 62%),' +
            'radial-gradient(ellipse 60% 40% at 92% -4%, rgba(34,211,238,0.07) 0%, transparent 60%)',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {children}
      </main>
    </div>
  )
}
