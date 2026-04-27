'use client'
import { useEffect, useState } from 'react'

export function CronometroEscalamiento({ horaEnvio, horaRespuesta, limiteMinutos = 60 }: { horaEnvio: Date | string | null; horaRespuesta: Date | string | null; limiteMinutos?: number }) {
  const [display, setDisplay] = useState('--:--')
  const [estado, setEstado] = useState<'espera'|'verde'|'amber'|'rojo'|'vencido'|'respondido'>('espera')
  const [tiempoResp, setTiempoResp] = useState<string|null>(null)

  useEffect(() => {
    if (!horaEnvio) { setEstado('espera'); return }
    const envio = new Date(horaEnvio).getTime()
    const limite = limiteMinutos * 60000

    if (horaRespuesta) {
      const diff = new Date(horaRespuesta).getTime() - envio
      const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000)
      setDisplay(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
      setTiempoResp(`Respondido en ${m}m ${s}s`)
      setEstado('respondido')
      return
    }

    const tick = () => {
      const remaining = limite - (Date.now() - envio)
      if (remaining <= 0) {
        const over = Math.abs(remaining)
        const m = Math.floor(over / 60000), s = Math.floor((over % 60000) / 1000)
        setDisplay(`+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
        setEstado('vencido')
        return
      }
      const rm = Math.floor(remaining / 60000), rs = Math.floor((remaining % 60000) / 1000)
      setDisplay(`${String(rm).padStart(2,'0')}:${String(rs).padStart(2,'0')}`)
      setEstado(rm > 30 ? 'verde' : rm > 5 ? 'amber' : 'rojo')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [horaEnvio, horaRespuesta, limiteMinutos])

  if (estado === 'espera') return (
    <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Esperando envío de correo</div>
    </div>
  )

  const colors = {
    verde:      { bg: '#EAF3DE', color: '#3B6D11' },
    amber:      { bg: '#FAEEDA', color: '#854F0B' },
    rojo:       { bg: '#FCEBEB', color: '#A32D2D' },
    vencido:    { bg: '#FCEBEB', color: '#A32D2D' },
    respondido: { bg: '#EAF3DE', color: '#3B6D11' },
    espera:     { bg: '#F1EFE8', color: '#444441' },
  }
  const { bg, color } = colors[estado]

  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: '9px', color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
        {estado === 'respondido' ? 'Respondido' : 'Tiempo restante'}
      </div>
      <div className={estado === 'vencido' ? 'nd-blink' : ''} style={{ fontSize: '22px', fontWeight: 500, fontFamily: 'monospace', color }}>
        {display}
      </div>
      <div style={{ fontSize: '10px', color, marginTop: '2px' }}>
        {estado === 'vencido' ? 'VENCIDO — considera escalar' : estado === 'respondido' ? tiempoResp : `de ${limiteMinutos} minutos`}
      </div>
    </div>
  )
}
