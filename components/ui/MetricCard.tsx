export function MetricCard({ label, value, sub, valueColor }: { label: string; value: string | number; sub?: string; valueColor?: string }) {
  return (
    <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 500, color: valueColor ?? 'var(--foreground)', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}
