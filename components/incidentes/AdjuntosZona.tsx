'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

interface Adjunto {
  id: string
  url: string
  nombre: string
  tipo: string | null
  tamanoBytes: number | null
}

export function compressImage(dataUrl: string, maxWidth = 1400): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

function formatBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function AdjuntosZona({ incidenteId, escalamientoId, disabled, noGrid, contexto }: { incidenteId?: string; escalamientoId?: string; disabled?: boolean; noGrid?: boolean; contexto?: string }) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (incidenteId)    params.set('incidenteId', incidenteId)
    if (escalamientoId) params.set('escalamientoId', escalamientoId)
    if (contexto)       params.set('contexto', contexto)
    const res = await fetch(`/api/adjuntos?${params}`)
    if (res.ok) setAdjuntos(await res.json())
  }, [incidenteId, escalamientoId, contexto])

  useEffect(() => { load() }, [load])


  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>(resolve => {
        reader.onload = e => resolve(e.target!.result as string)
        reader.readAsDataURL(file)
      })

      let finalUrl = dataUrl
      if (file.type.startsWith('image/')) {
        finalUrl = await compressImage(dataUrl)
      }

      const tamanoBytes = Math.round(finalUrl.length * 0.75)
      const res = await fetch('/api/adjuntos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          nombre: file.name || `captura-${Date.now()}.jpg`,
          tipo: file.type || 'image/jpeg',
          tamanoBytes,
          incidenteId: incidenteId ?? null,
          escalamientoId: escalamientoId ?? null,
          contexto: contexto ?? null,
        }),
      })
      if (res.ok) await load()
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/adjuntos/${id}`, { method: 'DELETE' })
    setAdjuntos(prev => prev.filter(a => a.id !== id))
  }

  const isImage = (a: Adjunto) => (a.tipo ?? '').startsWith('image/') || a.url.startsWith('data:image')

  const dropZoneStyle: React.CSSProperties = {
    border: `1.5px dashed ${dragging ? 'var(--foreground)' : 'var(--border)'}`,
    borderRadius: '8px',
    padding: '14px',
    textAlign: 'center',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'border-color 0.15s',
    background: dragging ? 'var(--muted)' : 'transparent',
  }

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '8px' }}>
        Adjuntos {adjuntos.length > 0 && `(${adjuntos.length})`}
      </div>

      {!disabled && (
        <>
          <div
            style={dropZoneStyle}
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            onPaste={async (e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile()
                  if (file) await uploadFile(file)
                }
              }
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {uploading
                ? 'Subiendo...'
                : 'Arrastra, haz clic, o haz clic aquí y pega Ctrl+V'}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
        </>
      )}

      {!noGrid && adjuntos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
          {adjuntos.map(adj => (
            <div key={adj.id} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '0.5px solid var(--border)', background: 'var(--muted)', aspectRatio: '1' }}>
              {isImage(adj) ? (
                <img
                  src={adj.url}
                  alt={adj.nombre}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
                  onClick={() => setLightbox(adj.url)}
                />
              ) : (
                <div
                  style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '4px' }}
                  onClick={() => setLightbox(adj.url)}
                >
                  <div style={{ fontSize: '20px' }}>📄</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{adj.nombre}</div>
                </div>
              )}
              {!disabled && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(adj.id) }}
                  style={{ position: 'absolute', top: '3px', right: '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >
                  ×
                </button>
              )}
              {adj.tamanoBytes && (
                <div style={{ position: 'absolute', bottom: '2px', left: '3px', fontSize: '8px', color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.4)', padding: '1px 4px', borderRadius: '3px' }}>
                  {formatBytes(adj.tamanoBytes)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img
            src={lightbox}
            alt="Vista completa"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: '20px', right: '24px', background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', fontSize: '20px', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
