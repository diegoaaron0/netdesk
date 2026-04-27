export function GuiaEscalamiento({ proveedor, instruccion }: { proveedor: string; instruccion: string }) {
  return (
    <div style={{ background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
      <div style={{ fontSize: '9px', fontWeight: 500, color: '#633806', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
        Guía de escalamiento — {proveedor}
      </div>
      <div style={{ fontSize: '11px', color: '#412402', lineHeight: 1.6 }}>{instruccion}</div>
    </div>
  )
}
