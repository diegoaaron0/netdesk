const BULLETS = [
  'Verificar conectividad local y equipos encendidos.',
  'Validar CID y estado del servicio en la plataforma del proveedor.',
  'Escalar al grupo de WhatsApp/correo con la información solicitada.',
]

export function GuiaEscalamiento({ proveedor, instruccion }: { proveedor: string; instruccion: string }) {
  return (
    <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Guía de escalamiento — {proveedor}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#78350F', lineHeight: 1.6, marginBottom: '8px' }}>{instruccion}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {BULLETS.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: '#78350F' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '1px', flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
            {b}
          </div>
        ))}
      </div>
    </div>
  )
}
