'use client'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function LayoutShell({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  const pathname = usePathname()
return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebar}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--muted)', padding: '18px', marginLeft: '192px' }}>
        {children}
      </main>
    </div>
  )
}
