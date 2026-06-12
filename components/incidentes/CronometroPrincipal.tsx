'use client'
import { useEffect, useState } from 'react'

function formatTime(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export function CronometroPrincipal({ horaRegistro, horaFin, tiempoAcumuladoMin, horaRegistroOriginal }: { horaRegistro: Date | string; horaFin: Date | string | null; tiempoAcumuladoMin?: number | null; horaRegistroOriginal?: Date | string | null }) {
  const [display, setDisplay] = useState('00:00:00')
  const [detenido, setDetenido] = useState(false)

  useEffect(() => {
    if (horaFin) {
      // Cuando está resuelto: usar horaRegistroOriginal (inicio real) si existe
      const base = horaRegistroOriginal ? new Date(horaRegistroOriginal).getTime() : new Date(horaRegistro).getTime()
      setDisplay(formatTime(new Date(horaFin).getTime() - base))
      setDetenido(true)
      return
    }
    const inicio = new Date(horaRegistro).getTime()
    const acumMs = (tiempoAcumuladoMin ?? 0) * 60 * 1000
    const tick = () => setDisplay(formatTime(Date.now() - inicio + acumMs))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [horaRegistro, horaFin, tiempoAcumuladoMin, horaRegistroOriginal])

  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
        {detenido ? 'Tiempo total' : 'Tiempo del incidente'}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 500, fontFamily: 'monospace', color: detenido ? '#86efac' : 'white', letterSpacing: '0.05em', lineHeight: 1 }}>
        {display}
      </div>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
        {detenido ? 'Incidente resuelto' : 'Corre hasta resolución'}
      </div>
    </div>
  )
}
