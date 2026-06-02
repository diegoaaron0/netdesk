'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardAnaliticoResponse, IncidenteListItem, SlaProveedor, MttrProveedor } from '@/types/dashboard'
import { IncidentTimeline, fmtMin, type DrillIncidente } from './DrillPanel'
import GraficosAnalitico from './GraficosAnalitico'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstDayOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros', CORTE_ELECTRICO: '⚡ Corte eléctr.',
}

function slaColor(pct: number | null | undefined) {
  if (pct == null) return 'var(--muted-foreground)'
  if (pct >= 90) return '#15803d'
  if (pct >= 70) return '#d97706'
  return '#b91c1c'
}
function slaBg(pct: number | null | undefined) {
  if (pct == null) return 'var(--muted)'
  if (pct >= 90) return '#f0fdf4'
  if (pct >= 70) return '#fffbeb'
  return '#fef2f2'
}
function mttrColor(min: number | null | undefined) {
  if (min == null) return 'var(--muted-foreground)'
  if (min < 120) return '#15803d'
  if (min < 240) return '#d97706'
  return '#b91c1c'
}

function DeltaBadge({ delta, invertir = false }: { delta: number | null; invertir?: boolean }) {
  if (delta == null) return null
  const mejor = invertir ? delta < 0 : delta > 0
  const mismo = delta === 0
  const color = mismo ? '#6b7280' : mejor ? '#15803d' : '#b91c1c'
  const bg    = mismo ? '#f3f4f6' : mejor ? '#f0fdf4' : '#fef2f2'
  const sign  = delta > 0 ? '+' : ''
  return (
    <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '999px', background: bg, color }}>
      {sign}{delta}pp
    </span>
  )
}

// ─── Converts IncidenteListItem → DrillIncidente (compatible con IncidentTimeline) ──

function toDrill(item: IncidenteListItem): DrillIncidente {
  return {
    id: item.id,
    codigo: item.codigo,
    tipo: item.tipo,
    horaInicio: item.horaInicio,
    horaRegistroMs: item.horaRegistroMs,
    horaFin: item.horaFin,
    mttrMin: item.mttrMin,
    horaEnvioN1: item.horaEnvioN1,
    horaRespuesta: item.horaRespuesta,
    noHuboRespuesta: item.noHuboRespuesta,
    evaluableProveedor: item.evaluableProveedor,
    minHastaEnvio: item.minHastaEnvio,
    minRespuesta: item.minRespuesta,
    minSolucionDesdeCorreo: item.minSolucionDesdeCorreo,
    dentroSLA: item.dentroSLA,
  }
}

// ─── Incident list with expandable inline timeline ────────────────────────────

function IncidentList({
  items, expandedId, onExpand, sortBy = 'date', max = 50,
}: {
  items: IncidenteListItem[]
  expandedId: string | null
  onExpand: (id: string | null) => void
  sortBy?: 'date' | 'mttr' | 'iei' | 'tResp'
  max?: number
}) {
  const router = useRouter()
  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'mttr')  return (b.mttrMin ?? 0) - (a.mttrMin ?? 0)
    if (sortBy === 'iei')   return b.ieiEstimado - a.ieiEstimado
    if (sortBy === 'tResp') return (b.minRespuesta ?? 0) - (a.minRespuesta ?? 0)
    return b.horaRegistroMs - a.horaRegistroMs
  }).slice(0, max)

  if (!sorted.length) return <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '16px 0', textAlign: 'center' }}>Sin incidentes en este período.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sorted.map(item => (
        <div key={item.id}>
          {expandedId === item.id ? (
            <div>
              <div onClick={() => onExpand(null)} style={{ fontSize: '10px', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '2px 4px', marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>▲</span> cerrar
              </div>
              <IncidentTimeline
                inc={toDrill(item)}
                onNavigate={() => router.push(`/incidentes/${item.id}`)}
              />
            </div>
          ) : (
            <div
              onClick={() => onExpand(item.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', gap: '8px',
                background: item.evaluableProveedor ? 'var(--background)' : 'var(--muted)',
                border: `0.5px solid ${item.evaluableProveedor ? 'var(--border)' : 'transparent'}`,
                opacity: item.evaluableProveedor ? 1 : 0.75,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--muted)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = item.evaluableProveedor ? 'var(--background)' : 'var(--muted)'}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#185FA5', whiteSpace: 'nowrap' }}>{item.codigo}</span>
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>{item.tiendaCodigo}</span>
                <span style={{ color: 'var(--muted-foreground)' }}>{TIPO_LABELS[item.tipo] ?? item.tipo}</span>
                <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>{item.fecha}</span>
                {!item.evaluableProveedor && (
                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280', fontWeight: 500 }}>no evaluable</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {item.ieiEstimado > 0 && <span style={{ fontSize: '10px', color: '#b91c1c', fontFamily: 'monospace' }}>{fmtCosto(item.ieiEstimado)}</span>}
                {item.mttrMin != null && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(item.mttrMin)}</span>}
                {item.dentroSLA === true  && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>✓SLA</span>}
                {item.dentroSLA === false && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: '#fef2f2', color: '#b91c1c', fontWeight: 600 }}>✗SLA</span>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Provider table ───────────────────────────────────────────────────────────

function ProvTable({ rows, selectedProv, onSelect, cols }: {
  rows: Array<{ nombre: string; pct?: number | null; min?: number | null; costo?: number; evaluables?: number; delta?: number | null }>
  selectedProv: string | null
  onSelect: (p: string) => void
  cols: Array<{ key: string; label: string; fmt: (v: any) => string; color?: (v: any) => string }>
}) {
  return (
    <div style={{ border: '0.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: 'var(--muted)' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</th>
            {cols.map(c => <th key={c.key} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isSel = selectedProv === r.nombre
            return (
              <tr key={r.nombre} onClick={() => onSelect(r.nombre)} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', background: isSel ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--muted)' }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
              >
                <td style={{ padding: '7px 10px', fontWeight: isSel ? 600 : 400, color: isSel ? '#1e40af' : 'var(--foreground)' }}>{r.nombre}</td>
                {cols.map(c => {
                  const v = (r as any)[c.key]
                  const clr = c.color ? c.color(v) : 'var(--foreground)'
                  return <td key={c.key} style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: clr }}>{v != null ? c.fmt(v) : '—'}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Panel sections ───────────────────────────────────────────────────────────

function PanelSLARespuesta({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [selProv, setSelProv] = useState<string | null>(null)
  const sla = data.cards.cumplimientoSLA
  const incAll = data.cards.incidentes.lista.filter(i => i.evaluableProveedor)
  const incFiltradas = selProv ? incAll.filter(i => i.proveedor === selProv) : incAll
  const incOrdenadas = [...incFiltradas].sort((a, b) => (b.minRespuesta ?? 0) - (a.minRespuesta ?? 0))

  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ background: slaBg(sla.slaRespuestaPct), borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>SLA RESPUESTA GLOBAL</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: slaColor(sla.slaRespuestaPct) }}>{sla.slaRespuestaPct}%</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
            <DeltaBadge delta={sla.deltaRespuestaPct} />
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Meta: 90%</span>
          </div>
        </div>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>EVALUABLES</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{sla.evaluables.length}</div>
          <div style={{ fontSize: '10px', color: '#15803d', marginTop: '2px' }}>
            {sla.evaluables.filter(e => e.slaRespOk).length} cumplieron
          </div>
        </div>
      </div>
      <ProvTable
        rows={sla.porProveedor.map(p => ({ nombre: p.nombre, pct: p.slaRespuestaPct, evaluables: p.evaluables, min: p.tRespPromMin }))}
        selectedProv={selProv}
        onSelect={p => setSelProv(selProv === p ? null : p)}
        cols={[
          { key: 'pct', label: 'SLA Resp.', fmt: v => `${v}%`, color: slaColor },
          { key: 'evaluables', label: 'Eval.', fmt: v => String(v) },
          { key: 'min', label: 'T.Resp prom.', fmt: v => fmtMin(v) },
        ]}
      />
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes {selProv ? `— ${selProv}` : '(todos)'} · ordenados por mayor T. respuesta
      </div>
      <IncidentList items={incOrdenadas} expandedId={expandedId} onExpand={onExpand} sortBy="tResp" />
    </>
  )
}

function PanelSLAResolucion({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [selProv, setSelProv] = useState<string | null>(null)
  const sla = data.cards.cumplimientoSLA
  const incAll = data.cards.incidentes.lista.filter(i => i.evaluableProveedor)
  const incFiltradas = selProv ? incAll.filter(i => i.proveedor === selProv) : incAll
  const incOrdenadas = [...incFiltradas].sort((a, b) => (b.minSolucionDesdeCorreo ?? 0) - (a.minSolucionDesdeCorreo ?? 0))

  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ background: slaBg(sla.slaResolucionPct), borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>SLA RESOLUCIÓN GLOBAL</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: slaColor(sla.slaResolucionPct) }}>{sla.slaResolucionPct}%</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
            <DeltaBadge delta={sla.deltaResolucionPct} />
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Meta: 90%</span>
          </div>
        </div>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>EVALUABLES</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{sla.evaluables.length}</div>
          <div style={{ fontSize: '10px', color: '#15803d', marginTop: '2px' }}>
            {sla.evaluables.filter(e => e.slaResolOk).length} cumplieron
          </div>
        </div>
      </div>
      <ProvTable
        rows={sla.porProveedor.map(p => ({ nombre: p.nombre, pct: p.slaResolucionPct, evaluables: p.evaluables, min: p.tResolPromMin }))}
        selectedProv={selProv}
        onSelect={p => setSelProv(selProv === p ? null : p)}
        cols={[
          { key: 'pct', label: 'SLA Resol.', fmt: v => `${v}%`, color: slaColor },
          { key: 'evaluables', label: 'Eval.', fmt: v => String(v) },
          { key: 'min', label: 'T.Resol prom.', fmt: v => fmtMin(v) },
        ]}
      />
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes {selProv ? `— ${selProv}` : '(todos)'} · ordenados por mayor T. resolución
      </div>
      <IncidentList items={incOrdenadas} expandedId={expandedId} onExpand={onExpand} sortBy="date" />
    </>
  )
}

function PanelMTTR({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [selProv, setSelProv] = useState<string | null>(null)
  const mttr = data.cards.mttrPromedio
  const incsResueltos = data.cards.incidentes.lista.filter(i => i.estado === 'RESUELTO' && i.mttrMin != null)
  const incFiltradas = selProv ? incsResueltos.filter(i => i.proveedor === selProv) : incsResueltos

  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>MTTR GLOBAL</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: mttrColor(mttr.minutos) }}>{fmtMin(mttr.minutos)}</div>
          <DeltaBadge delta={mttr.deltaMinutos != null ? -mttr.deltaMinutos : null} invertir={false} />
        </div>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>RESUELTOS</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{incsResueltos.length}</div>
        </div>
      </div>
      <ProvTable
        rows={mttr.porProveedor.map(p => ({ nombre: p.nombre, min: p.mttrMinutos, mejor: p.mejorTiempo, peor: p.peorTiempo, n: p.incidentesResueltos }))}
        selectedProv={selProv}
        onSelect={p => setSelProv(selProv === p ? null : p)}
        cols={[
          { key: 'min',  label: 'MTTR prom.', fmt: v => fmtMin(v), color: mttrColor },
          { key: 'mejor',label: 'Mejor',      fmt: v => fmtMin(v) },
          { key: 'peor', label: 'Peor',       fmt: v => fmtMin(v) },
          { key: 'n',    label: 'N',           fmt: v => String(v) },
        ]}
      />
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes resueltos {selProv ? `— ${selProv}` : '(todos)'} · mayor MTTR primero
      </div>
      <IncidentList items={incFiltradas} expandedId={expandedId} onExpand={onExpand} sortBy="mttr" />
    </>
  )
}

function PanelIEI({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [selProv, setSelProv] = useState<string | null>(null)
  const costo = data.cards.costoEstimado
  const incs = data.cards.incidentes.lista.filter(i => i.ieiEstimado > 0)
  const incFiltradas = selProv ? incs.filter(i => i.proveedor === selProv) : incs

  return (
    <>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ background: '#fffbeb', border: '0.5px solid #fde68a', borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#92400e', marginBottom: '2px' }}>IEI TOTAL</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#b45309' }}>{fmtCosto(costo.total)}</div>
          <DeltaBadge delta={costo.deltaVsAnterior} invertir />
        </div>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>Por agente</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{fmtCosto(costo.totalAgente)}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>Por proveedor</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{fmtCosto(costo.totalProveedor)}</div>
        </div>
      </div>
      <ProvTable
        rows={costo.proveedoresDesglose.map(p => ({ nombre: p.nombre, costo: p.costo }))}
        selectedProv={selProv}
        onSelect={p => setSelProv(selProv === p ? null : p)}
        cols={[
          { key: 'costo', label: 'IEI (S/)', fmt: v => fmtCosto(v), color: () => '#b45309' },
        ]}
      />
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes {selProv ? `— ${selProv}` : '(todos)'} · mayor IEI primero
      </div>
      <IncidentList items={incFiltradas} expandedId={expandedId} onExpand={onExpand} sortBy="iei" />
    </>
  )
}

function PanelIncidentes({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [tab, setTab] = useState<'todos' | 'reincidencia'>('todos')
  const inc = data.cards.incidentes
  const reInc = data.cards.reincidenciaCritica

  // Distribution by type
  const tipoCount: Record<string, number> = {}
  for (const i of inc.lista) tipoCount[i.tipo] = (tipoCount[i.tipo] ?? 0) + 1
  const tiposSorted = Object.entries(tipoCount).sort((a, b) => b[1] - a[1])
  const maxTipo = tiposSorted[0]?.[1] ?? 1

  return (
    <>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>TOTAL</div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{inc.total}</div>
          <DeltaBadge delta={inc.deltaVsAnterior} invertir />
        </div>
        <div style={{ background: '#fff7ed', border: '0.5px solid #fed7aa', borderRadius: '8px', padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', color: '#c2410c', marginBottom: '2px' }}>REINCIDENTES</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#c2410c' }}>{reInc.total}</div>
          <div style={{ fontSize: '10px', color: '#c2410c' }}>tiendas con 2+ caídas</div>
        </div>
      </div>

      {/* Distribución por tipo */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Por tipo</div>
        {tiposSorted.map(([tipo, cnt]) => (
          <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ fontSize: '11px', width: '120px', flexShrink: 0 }}>{TIPO_LABELS[tipo] ?? tipo}</div>
            <div style={{ flex: 1, height: '8px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(cnt / maxTipo * 100)}%`, height: '100%', background: '#3b82f6', borderRadius: '4px' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, width: '30px', textAlign: 'right' }}>{cnt}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {([['todos', 'Todos los incidentes'], ['reincidencia', 'Reincidentes']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: tab === t ? 600 : 400, borderRadius: '6px', border: 'none', background: tab === t ? '#185FA5' : 'var(--muted)', color: tab === t ? 'white' : 'var(--foreground)', cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'todos' && <IncidentList items={inc.lista} expandedId={expandedId} onExpand={onExpand} sortBy="date" />}
      {tab === 'reincidencia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reInc.tiendas.length === 0 && <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '16px 0' }}>Sin reincidentes en este período.</div>}
          {reInc.tiendas.map(t => (
            <div key={t.id} style={{ background: '#fff7ed', border: '0.5px solid #fed7aa', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{t.codigo}</span>
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginLeft: '8px' }}>{t.proveedor}</span>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#c2410c' }}>{t.caidas} caídas</span>
              </div>
              <div style={{ fontSize: '10px', color: '#92400e' }}>{t.razon} · {t.tipoRepetido} · IEI {fmtCosto(t.costoEstimado)}</div>
              {t.tendencia !== 'ESTABLE' && (
                <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '999px', background: t.tendencia === 'EMPEORA' ? '#fef2f2' : '#eff6ff', color: t.tendencia === 'EMPEORA' ? '#b91c1c' : '#1e40af', fontWeight: 600 }}>
                  {t.tendencia}
                </span>
              )}
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px', fontFamily: 'monospace' }}>
                {t.incidenteCodigos.join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PanelTiendas({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const [selTienda, setSelTienda] = useState<string | null>(null)
  const tiendas = data.cards.tiendasAfectadas
  const incs = data.cards.incidentes.lista
  const incsFiltrados = selTienda ? incs.filter(i => i.tiendaCodigo === selTienda) : incs

  // IEI por tienda
  const ieiByTienda = new Map<string, number>()
  for (const i of incs) ieiByTienda.set(i.tiendaCodigo, (ieiByTienda.get(i.tiendaCodigo) ?? 0) + i.ieiEstimado)

  const tiendasSorted = [...tiendas.lista].sort((a, b) => b.incidentesCount - a.incidentesCount)

  return (
    <>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>TIENDAS AFECTADAS</div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{tiendas.total}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{tiendas.porcentajeRed}% de la red</div>
        </div>
        <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 16px' }}>
          <DeltaBadge delta={tiendas.deltaVsAnterior} invertir />
        </div>
      </div>
      <div style={{ border: '0.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['Tienda', 'Proveedor', 'Inc.', 'IEI'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Tienda' || h === 'Proveedor' ? 'left' : 'right', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiendasSorted.map((t, i) => {
              const isSel = selTienda === t.codigo
              const iei = ieiByTienda.get(t.codigo) ?? 0
              return (
                <tr key={t.id} onClick={() => setSelTienda(isSel ? null : t.codigo)} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', background: isSel ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--muted)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '7px 10px', fontWeight: 600, color: isSel ? '#1e40af' : 'var(--foreground)' }}>
                    {t.codigo}
                    {t.nombre && <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', fontWeight: 400 }}>{t.nombre}</div>}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--muted-foreground)' }}>{t.proveedor}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{t.incidentesCount}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: iei > 0 ? '#b45309' : 'var(--muted-foreground)' }}>{iei > 0 ? fmtCosto(Math.round(iei)) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes {selTienda ? `— ${selTienda}` : '(todas las tiendas)'}
        {selTienda && (
          <button onClick={() => setSelTienda(null)} style={{ marginLeft: '8px', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', textDecoration: 'underline', padding: 0 }}>
            ver todas
          </button>
        )}
      </div>
      <IncidentList items={incsFiltrados} expandedId={expandedId} onExpand={onExpand} sortBy="date" />
    </>
  )
}

function PanelProveedorCritico({ data, expandedId, onExpand }: { data: DashboardAnaliticoResponse; expandedId: string | null; onExpand: (id: string | null) => void }) {
  const prov = data.cards.proveedorCritico
  const sla = data.cards.cumplimientoSLA

  if (!prov) return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
      Sin proveedor crítico detectado en este período.
    </div>
  )

  // Datos SLA separados del proveedor crítico
  const slaProvData = sla.porProveedor.find(p => p.nombre === prov.nombre)
  const mejor = sla.porProveedor.find(p => p.nombre !== prov.nombre && p.slaPct === Math.max(...sla.porProveedor.filter(x => x.nombre !== prov.nombre).map(x => x.slaPct)))

  return (
    <>
      <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
        <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Proveedor más crítico del período</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#991b1b', marginBottom: '10px' }}>{prov.nombre}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          {[
            { label: 'SLA Respuesta',  value: slaProvData ? `${slaProvData.slaRespuestaPct}%`  : `${prov.metricas.slaPct}%`, bad: (slaProvData?.slaRespuestaPct ?? prov.metricas.slaPct) < 90 },
            { label: 'SLA Resolución', value: slaProvData ? `${slaProvData.slaResolucionPct}%` : '—',                         bad: (slaProvData?.slaResolucionPct ?? 100) < 90 },
          ].map(({ label, value, bad }) => (
            <div key={label} style={{ background: 'white', borderRadius: '6px', padding: '8px 10px', border: `0.5px solid ${bad ? '#fca5a5' : '#e5e7eb'}` }}>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: bad ? '#b91c1c' : '#15803d' }}>{value}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>meta: 90%</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: 'MTTR',          value: fmtMin(prov.metricas.mttrMinutos),           bad: prov.metricas.mttrMinutos > 120 },
            { label: 'IEI',           value: fmtCosto(prov.metricas.costoEstimado),        bad: true },
            { label: 'Incidentes',    value: String(prov.metricas.incidentes),             bad: false },
            { label: 'Reincidentes',  value: String(prov.metricas.reincidenciaTiendas),    bad: prov.metricas.reincidenciaTiendas > 0 },
          ].map(({ label, value, bad }) => (
            <div key={label} style={{ background: 'white', borderRadius: '6px', padding: '6px 8px', border: `0.5px solid ${bad ? '#fca5a5' : '#e5e7eb'}` }}>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginBottom: '1px' }}>{label}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: bad ? '#b91c1c' : 'var(--foreground)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {mejor && (
        <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '11px' }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>Mejor del período: {mejor.nombre}</span>
          <span style={{ color: 'var(--muted-foreground)', marginLeft: '8px' }}>SLA {mejor.slaPct}% · MTTR {fmtMin(mejor.tResolPromMin)}</span>
        </div>
      )}

      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Incidentes de {prov.nombre}
      </div>
      <IncidentList items={prov.incidentesDetalle} expandedId={expandedId} onExpand={onExpand} sortBy="iei" />
    </>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ id, label, value, sub, delta, invertirDelta = false, color, bg, selected, onClick }: {
  id: string; label: string; value: string; sub?: string
  delta?: number | null; invertirDelta?: boolean
  color: string; bg: string; selected: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: '1 1 120px', minWidth: '120px', padding: '12px 14px',
        background: selected ? '#eff6ff' : bg,
        border: selected ? '1.5px solid #3b82f6' : '0.5px solid var(--border)',
        borderRadius: '10px', cursor: 'pointer', transition: 'box-shadow 0.15s',
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.15)' : 'none',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1, marginBottom: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}>{sub}</div>}
      {delta != null && <DeltaBadge delta={delta} invertir={invertirDelta} />}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardAnalitico() {
  const [desde, setDesde]   = useState(firstDayOfMonth)
  const [hasta, setHasta]   = useState(todayStr)
  const [proveedorId, setProveedorId] = useState('')
  const [data, setData]     = useState<DashboardAnaliticoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(false)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [expandedIncId, setExpandedIncId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const p = new URLSearchParams({ desde, hasta })
      if (proveedorId) p.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/analitico?${p}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, proveedorId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  const handleCardClick = (id: string) => {
    setSelectedCard(prev => prev === id ? null : id)
    setExpandedIncId(null)
  }

  const PANEL_TITLES: Record<string, string> = {
    slaResp:    'SLA Respuesta — primera respuesta al proveedor',
    slaResol:   'SLA Resolución — tiempo de resolución',
    mttr:       'MTTR — tiempo promedio de resolución',
    iei:        'IEI — impacto económico estimado',
    incidentes: 'Incidentes del período',
    tiendas:    'Tiendas afectadas',
    provCrit:   'Proveedor crítico',
  }

  const c = data?.cards
  const sla = c?.cumplimientoSLA
  const provCrit = c?.proveedorCritico

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', position: 'relative' }}>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        {data?.proveedores && (
          <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
            <option value="">Todos los proveedores</option>
            {data.proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
        )}
        <button onClick={fetchData} disabled={loading} style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600, background: loading ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: '7px', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
        <button onClick={() => { setDesde(firstDayOfMonth()); setHasta(todayStr()); setProveedorId('') }} style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--muted)', border: 'none', borderRadius: '7px', cursor: 'pointer', color: 'var(--foreground)' }}>
          Limpiar filtros
        </button>
      </div>

      {/* ── Estado vacío / error ─────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#b91c1c', fontSize: '13px' }}>
          Error cargando datos. <button onClick={fetchData} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}>Intenta de nuevo.</button>
        </div>
      )}
      {!data && !loading && !error && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
          Preparando datos…
        </div>
      )}
      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando…</div>
      )}

      {/* ── 7 KPI Cards ──────────────────────────────────────────────────── */}
      {c && (
        <div style={{ padding: '20px 24px 12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <KpiCard
              id="slaResp" label="SLA Respuesta"
              value={`${sla!.slaRespuestaPct}%`}
              sub={`${sla!.evaluables.length} evaluables`}
              delta={sla!.deltaRespuestaPct}
              color={slaColor(sla!.slaRespuestaPct)} bg={slaBg(sla!.slaRespuestaPct)}
              selected={selectedCard === 'slaResp'} onClick={() => handleCardClick('slaResp')}
            />
            <KpiCard
              id="slaResol" label="SLA Resolución"
              value={`${sla!.slaResolucionPct}%`}
              sub={`${sla!.evaluables.filter(e => e.slaResolOk).length} cumplieron`}
              delta={sla!.deltaResolucionPct}
              color={slaColor(sla!.slaResolucionPct)} bg={slaBg(sla!.slaResolucionPct)}
              selected={selectedCard === 'slaResol'} onClick={() => handleCardClick('slaResol')}
            />
            <KpiCard
              id="mttr" label="MTTR"
              value={fmtMin(c.mttrPromedio.minutos)}
              sub="promedio resolución"
              delta={c.mttrPromedio.deltaMinutos != null ? -c.mttrPromedio.deltaMinutos : null}
              color={mttrColor(c.mttrPromedio.minutos)} bg="var(--card)"
              selected={selectedCard === 'mttr'} onClick={() => handleCardClick('mttr')}
            />
            <KpiCard
              id="iei" label="IEI"
              value={fmtCosto(c.costoEstimado.total)}
              sub={c.costoEstimado.proveedorMayorImpacto ? `Mayor: ${c.costoEstimado.proveedorMayorImpacto.nombre}` : undefined}
              delta={c.costoEstimado.deltaVsAnterior} invertirDelta
              color="#b45309" bg="#fffbeb"
              selected={selectedCard === 'iei'} onClick={() => handleCardClick('iei')}
            />
            <KpiCard
              id="incidentes" label="Incidentes"
              value={String(c.incidentes.total)}
              sub={`${c.reincidenciaCritica.total} tiendas reincidentes`}
              delta={c.incidentes.deltaVsAnterior} invertirDelta
              color="#185FA5" bg="var(--card)"
              selected={selectedCard === 'incidentes'} onClick={() => handleCardClick('incidentes')}
            />
            <KpiCard
              id="tiendas" label="Tiendas"
              value={String(c.tiendasAfectadas.total)}
              sub={`${c.tiendasAfectadas.porcentajeRed}% de la red`}
              delta={c.tiendasAfectadas.deltaVsAnterior} invertirDelta
              color="#1d9e75" bg="var(--card)"
              selected={selectedCard === 'tiendas'} onClick={() => handleCardClick('tiendas')}
            />
            <KpiCard
              id="provCrit" label="Prov. Crítico"
              value={provCrit?.nombre ?? '—'}
              sub={provCrit ? `Score: ${provCrit.score} · SLA ${provCrit.metricas.slaPct}%` : 'Sin alertas'}
              color={provCrit ? '#b91c1c' : '#15803d'} bg={provCrit ? '#fef2f2' : 'var(--card)'}
              selected={selectedCard === 'provCrit'} onClick={() => handleCardClick('provCrit')}
            />
          </div>
        </div>
      )}

      {/* ── Gráficos analíticos ─────────────────────────────────────────── */}
      {data && <GraficosAnalitico data={data} />}

      {/* ── Panel lateral ───────────────────────────────────────────────── */}
      {selectedCard && data && (
        <>
          <div onClick={() => setSelectedCard(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 79 }} />
          <aside style={{
            position: 'fixed', top: 0, right: 0, width: '480px', maxWidth: '95vw',
            height: '100vh', background: 'var(--card)', borderLeft: '0.5px solid var(--border)',
            zIndex: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
                {PANEL_TITLES[selectedCard]}
              </div>
              <button onClick={() => setSelectedCard(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--muted-foreground)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', flex: 1 }}>
              {selectedCard === 'slaResp'    && <PanelSLARespuesta     data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'slaResol'   && <PanelSLAResolucion    data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'mttr'       && <PanelMTTR             data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'iei'        && <PanelIEI              data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'incidentes' && <PanelIncidentes       data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'tiendas'    && <PanelTiendas          data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
              {selectedCard === 'provCrit'   && <PanelProveedorCritico data={data} expandedId={expandedIncId} onExpand={id => setExpandedIncId(expandedIncId === id ? null : id)} />}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
