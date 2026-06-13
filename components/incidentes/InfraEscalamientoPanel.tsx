'use client'
import { apiMutate } from '@/lib/api-mutate'

export function InfraEscalamientoPanel({ inc, isClosed, onRefresh }: { inc: any; isClosed: boolean; onRefresh: () => void }) {
  if (!inc.escaladoInfraId) return null

  const fmtH = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  async function handleLiberar() {
    const { ok } = await apiMutate(`/api/incidentes/${inc.id}`, {
      method: 'PUT',
      json: { escaladoInfraId: null, horaEscaladoInfra: null, notaEscaladoInfra: null },
      errorPrefix: 'No se pudo liberar el incidente de infraestructura',
    })
    if (!ok) return
    onRefresh()
  }

  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.07) 0%,rgba(139,92,246,.04) 100%)', border: '1.5px solid rgba(99,102,241,.3)', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🔧</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5' }}>Escalado a Infraestructura</span>
        </div>
        {!isClosed && (
          <button onClick={handleLiberar}
            style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', border: '1px solid rgba(99,102,241,.4)', borderRadius: '4px', color: '#6366f1', cursor: 'pointer' }}>
            Liberar
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
        <div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', marginBottom: '2px' }}>Agente asignado</div>
          <div style={{ fontWeight: 600 }}>{[inc.infraNombre, inc.infraApellido].filter(Boolean).join(' ')}</div>
          {inc.infraEmail   && <div style={{ color: 'var(--muted-foreground)' }}>{inc.infraEmail}</div>}
          {inc.infraCelular && <div style={{ color: 'var(--muted-foreground)' }}>{inc.infraCelular}</div>}
        </div>
        <div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', marginBottom: '2px' }}>Hora escalado</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inc.horaEscaladoInfra ? fmtH(inc.horaEscaladoInfra) : '—'}</div>
        </div>
      </div>
      {inc.notaEscaladoInfra && (
        <div style={{ marginTop: '8px', fontSize: '11px', background: 'rgba(99,102,241,.07)', borderRadius: '6px', padding: '6px 10px' }}>
          {inc.notaEscaladoInfra}
        </div>
      )}
    </div>
  )
}
