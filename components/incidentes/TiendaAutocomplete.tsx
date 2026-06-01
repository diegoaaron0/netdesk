'use client'
import { useState, useRef, useEffect } from 'react'

export interface NivelEsc {
  id: string
  nivel: number
  nombreContacto: string
  email: string | null
  celular: string | null
  tiempoRespSev1: string | null
}

export interface Tienda {
  id: string
  codigo: string
  nombreCc: string
  formato: string | null
  direccion: string | null
  distrito: string | null
  cluster: string | null
  tipoConexion: string | null
  cidServicio: string | null
  instruccionReporte: string | null
  administradorCelular: string | null
  celularTienda: string | null
  tieneContingencia: boolean | null
  proveedor: {
    nombre: string
    instruccionGeneral: string | null
    telefonoSoporte: string | null
    correoSoporte: string | null
    niveles: NivelEsc[]
  } | null
}

export function TiendaAutocomplete({ onSelect }: { onSelect: (tienda: Tienda, historial: any[]) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Tienda[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tiendas?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data); setOpen(true)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = async (t: Tienda) => {
    setQuery(`${t.codigo} — ${t.nombreCc}`)
    setOpen(false)
    const res = await fetch(`/api/tiendas/${t.id}/historial`)
    const historial = await res.json()
    onSelect(t, historial)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Buscar por código o nombre de tienda..."
        style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '8px', marginTop: '2px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {results.map(t => (
            <button key={t.id} type="button" onClick={() => handleSelect(t)}
              style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', marginRight: '8px' }}>{t.codigo}</span>
              <span>{t.nombreCc}</span>
              {t.proveedor && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginLeft: '6px' }}>· {t.proveedor.nombre} · {t.distrito}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
