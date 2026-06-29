'use client'
import { useState, useEffect } from 'react'
import { apiMutate } from '@/lib/api-mutate'
import { AdjuntosZona, compressImage } from '@/components/incidentes/AdjuntosZona'
import { CronometroEscalamiento } from '@/components/incidentes/CronometroEscalamiento'
import { buildCorreo, toDatetimeLocal, fromDatetimeLocal, minToHM } from '@/components/incidentes/helpers'
import { parseEtaMin } from '@/lib/sla-core'

const IcoTrashEsc = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IcoPhone  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43A2 2 0 0 1 3.6 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.84a16 16 0 0 0 6.07 6.07l.96-1.06a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>

function AtcLlamadaRow({ atc, isClosed, onFin, onSaveNotas, onSaveHoras, onDelete }: {
  atc: any; isClosed: boolean; onFin: () => void; onSaveNotas: (n: string) => void; onSaveHoras: (inicio: string, fin: string) => void; onDelete: () => void
}) {
  const [notas, setNotas] = useState(atc.notas ?? '')
  const [editHoras, setEditHoras] = useState(false)
  const [inicioEdit, setInicioEdit] = useState(toDatetimeLocal(atc.inicio))
  const [finEdit, setFinEdit] = useState(toDatetimeLocal(atc.fin))
  useEffect(() => {
    if (!editHoras) { setInicioEdit(toDatetimeLocal(atc.inicio)); setFinEdit(toDatetimeLocal(atc.fin)) }
  }, [atc.inicio, atc.fin, editHoras])

  const inicio = new Date(atc.inicio).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const finHora = atc.fin ? new Date(atc.fin).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div style={{ padding: '10px 12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IcoPhone />
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{inicio}</span>
          {finHora
            ? <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>→ {finHora} · {atc.duracionMin != null ? minToHM(atc.duracionMin) : '—'}</span>
            : <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 500 }}>● En curso</span>}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {!isClosed && (
            <button onClick={() => setEditHoras(v => !v)} title="Editar horas de la llamada"
              style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: editHoras ? '#dbeafe' : 'rgba(0,0,0,0.06)', border: `1px solid ${editHoras ? '#93c5fd' : 'var(--border)'}`, borderRadius: '4px', color: editHoras ? '#1d4ed8' : 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px' }}>✎</button>
          )}
          {!atc.fin && !isClosed && (
            <button onClick={onFin} style={{ padding: '2px 8px', fontSize: '10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', cursor: 'pointer' }}>
              ■ Finalizar
            </button>
          )}
          {!isClosed && (
            <button onClick={onDelete} style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: '#dc2626', cursor: 'pointer' }}>
              <IcoTrashEsc />
            </button>
          )}
        </div>
      </div>
      {editHoras && !isClosed && (
        <div style={{ marginBottom: '8px', padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corregir horas de la llamada</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Inicio</div>
              <input type="datetime-local" value={inicioEdit} onChange={e => setInicioEdit(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Fin</div>
              <input type="datetime-local" value={finEdit} onChange={e => setFinEdit(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={() => { onSaveHoras(inicioEdit, finEdit); setEditHoras(false) }}
            style={{ padding: '5px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
            Guardar horas
          </button>
        </div>
      )}
      <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => onSaveNotas(notas)}
        placeholder="Notas de la llamada..."
        disabled={isClosed}
        style={{ width: '100%', padding: '6px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '48px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
    </div>
  )
}

export function EscalamientoCard({ esc, allEscs, inc, isClosed, onRefresh }: {
  esc: any; allEscs: any[]; inc: any; isClosed: boolean; onRefresh: () => void
}) {
  const [showTemplate, setShowTemplate] = useState(false)
  const [copied, setCopied]             = useState(false)
  const [respuestaText, setRespuestaText] = useState(esc.respuestaTexto ?? '')
  const [showRespText, setShowRespText] = useState(false)
  const etaMinsInit = parseEtaMin(esc.tiempoEstimadoSolucion ?? '') ?? 0
  const [etaH, setEtaH] = useState(Math.floor(etaMinsInit / 60))
  const [etaM, setEtaM] = useState(etaMinsInit % 60)
  const [horaRespManual, setHoraRespManual] = useState('')
  const [editTiempos, setEditTiempos] = useState(false)
  const [horaEnvioEdit, setHoraEnvioEdit] = useState(toDatetimeLocal(esc.horaEnvioCorreo) ?? '')
  const [horaRespEdit, setHoraRespEdit] = useState(toDatetimeLocal(esc.horaRespuesta) ?? '')
  const [savingTiempos, setSavingTiempos] = useState(false)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (!editTiempos) {
      setHoraEnvioEdit(toDatetimeLocal(esc.horaEnvioCorreo) ?? '')
      setHoraRespEdit(toDatetimeLocal(esc.horaRespuesta) ?? '')
    }
  }, [esc.horaEnvioCorreo, esc.horaRespuesta, editTiempos])
  const [showAtc, setShowAtc]           = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [escAdjKey, setEscAdjKey] = useState(0)

  const nivelData  = inc.nivelesProveedor?.find((n: any) => n.nivel === esc.nivel)
  const prevEscs   = allEscs.filter((e: any) => e.nivel < esc.nivel).sort((a: any, b: any) => a.nivel - b.nivel)
  const templateText = buildCorreo(inc, nivelData, esc.nivel, prevEscs)
  const [templateBody, setTemplateBody] = useState<string>(esc.cuerpoCorreo ?? templateText)

  const isRespondido   = !!esc.horaRespuesta
  const isSinRespuesta = !!esc.noHuboRespuesta
  // Si el incidente está cerrado, el cronómetro nunca debe seguir corriendo
  // (defensa por si quedó un escalamiento sin sellar).
  const isCorriendo    = !!esc.horaEnvioCorreo && !isRespondido && !isSinRespuesta && !isClosed
  const horaCreado     = new Date(esc.horaEnvioCorreo ?? esc.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

  async function copyTemplate() {
    await navigator.clipboard.writeText(templateBody)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function saveTemplate() {
    setSavingTemplate(true)
    await apiMutate(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      json: { cuerpoCorreo: templateBody },
      errorPrefix: 'No se pudo guardar la plantilla',
    })
    setSavingTemplate(false)
  }

  async function handleEnvio() {
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/envio`, { method: 'PUT', errorPrefix: 'No se pudo registrar el envío' })
    if (!ok) return
    onRefresh()
  }

  async function handleRespuesta() {
    setSaving(true)
    const totalMin = etaH * 60 + etaM
    const tiempoEstFinal = totalMin > 0 ? String(totalMin) : ''
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/respuesta`, {
      method: 'PUT',
      json: {
        respuestaTexto: respuestaText,
        tiempoEstimadoSolucion: tiempoEstFinal,
        horaRespuesta: fromDatetimeLocal(horaRespManual) ?? undefined,
      },
      errorPrefix: 'No se pudo registrar la respuesta',
    })
    setSaving(false)
    if (!ok) return
    onRefresh()
  }

  async function handleSinRespuesta() {
    if (!confirm('¿Confirmar que no hubo respuesta del proveedor?')) return
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/sin-respuesta`, { method: 'PUT', errorPrefix: 'No se pudo registrar' })
    if (!ok) return
    onRefresh()
  }

  async function handleDelete() {
    const msg = isRespondido
      ? `Nivel ${esc.nivel} ya tiene respuesta registrada. ¿Eliminar de todas formas? Esta acción no se puede deshacer.`
      : isCorriendo
        ? 'El cronómetro ya está corriendo. ¿Eliminar de todas formas?'
        : '¿Eliminar este escalamiento?'
    if (!confirm(msg)) return
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar el escalamiento' })
    if (!ok) return
    onRefresh()
  }

  async function handleGuardarTiempos() {
    setSavingTiempos(true)
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      json: {
        horaEnvioCorreo: fromDatetimeLocal(horaEnvioEdit),
        horaRespuesta:   fromDatetimeLocal(horaRespEdit),
      },
      errorPrefix: 'No se pudieron guardar los tiempos',
    })
    setSavingTiempos(false)
    if (!ok) return
    setEditTiempos(false)
    onRefresh()
  }

  async function iniciarAtc() {
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/atc`, { method: 'POST', errorPrefix: 'No se pudo iniciar la llamada ATC' })
    if (!ok) return
    onRefresh()
  }

  async function finalizarAtc(atcId: string) {
    if (!confirm('¿Finalizar la llamada? Esto registrará la primera respuesta del proveedor.')) return
    const { ok } = await apiMutate(`/api/atc/${atcId}`, { method: 'PUT', json: { finalizar: true }, errorPrefix: 'No se pudo finalizar la llamada' })
    if (!ok) return
    onRefresh()
  }

  async function guardarHorasAtc(atcId: string, inicio: string, fin: string) {
    const { ok } = await apiMutate(`/api/atc/${atcId}`, {
      method: 'PUT',
      json: { inicio: fromDatetimeLocal(inicio), fin: fromDatetimeLocal(fin) },
      errorPrefix: 'No se pudieron guardar las horas de la llamada',
    })
    if (ok) onRefresh()
  }

  async function guardarNotasAtc(atcId: string, notas: string) {
    await apiMutate(`/api/atc/${atcId}`, { method: 'PUT', json: { notas }, errorPrefix: 'No se pudieron guardar las notas' })
  }

  async function eliminarAtc(atcId: string) {
    if (!confirm('¿Eliminar esta llamada ATC?')) return
    const { ok } = await apiMutate(`/api/atc/${atcId}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar la llamada' })
    if (!ok) return
    onRefresh()
  }

  const pasteHandler = (contexto: 'envio' | 'respuesta') => !isClosed ? async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile(); if (!file) continue
        const reader = new FileReader()
        const dataUrl = await new Promise<string>(res => { reader.onload = ev => res(ev.target!.result as string); reader.readAsDataURL(file) })
        const compressed = await compressImage(dataUrl)
        const { ok } = await apiMutate('/api/adjuntos', { method: 'POST', json: { url: compressed, nombre: `captura-${Date.now()}.jpg`, tipo: 'image/jpeg', tamanoBytes: Math.round(compressed.length*0.75), escalamientoId: esc.id, contexto }, errorPrefix: 'No se pudo adjuntar la captura' })
        if (!ok) return
        setEscAdjKey(k => k + 1)
      }
    }
  } : undefined

  return (
    <div style={{ background: 'var(--muted)', borderRadius: '12px', border: `1px solid ${isRespondido ? '#86efac' : isSinRespuesta ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, overflow: 'hidden' }}>

      {/* ── Header compacto ── */}
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>N{esc.nivel}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{esc.contactoEscalado}</span>
              {isRespondido  && <span style={{ fontSize: '10px', padding: '1px 7px', background: '#dcfce7', color: '#15803d', borderRadius: '20px', fontWeight: 600 }}>Respondido</span>}
              {isSinRespuesta && <span style={{ fontSize: '10px', padding: '1px 7px', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', fontWeight: 600 }}>Sin respuesta</span>}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
              {esc.emailContacto    && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>✉ {esc.emailContacto}</span>}
              {esc.telefonoContacto && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>📱 {esc.telefonoContacto}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, marginLeft: '8px' }}>
            <span style={{ fontSize: '9px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{horaCreado}</span>
            {!isClosed && isRespondido && (
              <button onClick={() => setEditTiempos(v => !v)} title="Editar tiempos"
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: editTiempos ? '#dbeafe' : 'rgba(0,0,0,0.06)', border: `1px solid ${editTiempos ? '#93c5fd' : 'var(--border)'}`, borderRadius: '4px', color: editTiempos ? '#1d4ed8' : 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px' }}>✎</button>
            )}
            {!isClosed && (
              <button onClick={handleDelete} title="Eliminar"
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: '#dc2626', cursor: 'pointer' }}>
                <IcoTrashEsc />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 12px' }} onPaste={pasteHandler('envio')}>

        {/* Plantilla */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <button onClick={() => setShowTemplate(v => !v)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              📄 Plantilla de correo {showTemplate ? '▲' : '▼'}
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={copyTemplate}
                style={{ fontSize: '10px', padding: '2px 8px', background: copied ? '#14532d' : 'transparent', color: copied ? '#86efac' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
              {!isClosed && <button onClick={() => setTemplateBody(buildCorreo(inc, nivelData, esc.nivel, prevEscs))}
                style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>🔄 Actualizar</button>}
              {showTemplate && !isClosed && (
                <button onClick={saveTemplate} disabled={savingTemplate}
                  style={{ fontSize: '10px', padding: '2px 8px', background: savingTemplate ? 'var(--muted)' : 'hsl(221,83%,45%)', color: savingTemplate ? 'var(--muted-foreground)' : 'white', border: 'none', borderRadius: '4px', cursor: savingTemplate ? 'wait' : 'pointer' }}>
                  {savingTemplate ? '...' : '💾 Guardar'}
                </button>
              )}
            </div>
          </div>
          {showTemplate && (
            <textarea value={templateBody} onChange={e => setTemplateBody(e.target.value)} disabled={isClosed}
              style={{ width: '100%', fontSize: '9px', background: 'var(--card)', padding: '8px 10px', borderRadius: '8px', color: 'var(--foreground)', lineHeight: 1.5, border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical', minHeight: '200px', outline: 'none', boxSizing: 'border-box' }} />
          )}
        </div>

        {/* Adjuntos envío */}
        <div style={{ marginBottom: '8px' }}>
          <AdjuntosZona key={`${escAdjKey}-1`} escalamientoId={esc.id} contexto="envio" disabled={isClosed} />
        </div>

        {/* Botón correo enviado */}
        {!esc.horaEnvioCorreo && !isClosed && !isSinRespuesta && (
          <button onClick={handleEnvio}
            style={{ width: '100%', padding: '9px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '6px' }}>
            ✉ Correo enviado → Iniciar cronómetro
          </button>
        )}
      </div>

      {/* ── Sección respuesta ── */}
      <div onPaste={pasteHandler('respuesta')}>

        {isCorriendo && (
          <div style={{ padding: '0 12px 12px' }}>
            {/* Cronómetro + formulario en 2 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'start', marginBottom: '8px' }}>
              <CronometroEscalamiento horaEnvio={esc.horaEnvioCorreo} horaRespuesta={esc.horaRespuesta} />
              <div>
                <button type="button" onClick={() => setShowRespText(v => !v)}
                  style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Respuesta del proveedor {showRespText ? '▲' : '▼'}
                </button>
                {showRespText && (
                  <textarea value={respuestaText} onChange={e => setRespuestaText(e.target.value)}
                    placeholder="Documenta la respuesta recibida..."
                    style={{ width: '100%', padding: '6px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '52px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>

            {/* ETA + Hora de respuesta en grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>ETA proveedor</label>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <input type="number" min="0" max="99" value={etaH} onChange={e => setEtaH(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '48px', padding: '5px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', textAlign: 'center' }} />
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>h</span>
                  <input type="number" min="0" max="59" value={etaM} onChange={e => setEtaM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    style={{ width: '48px', padding: '5px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', textAlign: 'center' }} />
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>min</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  Hora respuesta <span style={{ fontWeight: 400, textTransform: 'none' }}>(vacío = ahora)</span>
                </label>
                <input type="datetime-local" value={horaRespManual} onChange={e => setHoraRespManual(e.target.value)}
                  style={{ width: '100%', padding: '5px 7px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Adjuntos respuesta */}
            <div style={{ marginBottom: '8px' }}>
              <AdjuntosZona key={`${escAdjKey}-2`} escalamientoId={esc.id} contexto="respuesta" disabled={isClosed} />
            </div>

            {/* Botones acción */}
            {!isClosed && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRespuesta} disabled={saving}
                  style={{ flex: 1, padding: '8px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Guardando...' : '✓ Registrar respuesta'}
                </button>
                <button onClick={handleSinRespuesta}
                  style={{ flex: 1, padding: '8px', background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
                  ✗ No hubo respuesta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Respondido */}
        {isRespondido && (
          <div style={{ margin: '0 12px 10px' }}>
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d' }}>
                ✓ {minToHM(esc.tiempoRespuestaMin)} · {new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                {esc.tiempoEstimadoSolucion && (() => {
                  const m = parseEtaMin(esc.tiempoEstimadoSolucion)
                  return <span style={{ fontWeight: 400, marginLeft: '8px' }}>· ETA: {m != null ? minToHM(m) : esc.tiempoEstimadoSolucion}</span>
                })()}
              </div>
              {esc.respuestaTexto && (
                <div style={{ marginTop: '4px' }}>
                  <button type="button" onClick={() => setShowRespText(v => !v)}
                    style={{ fontSize: '10px', color: '#15803d', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                    {showRespText ? '▲ Ocultar' : '▼ Ver respuesta'}
                  </button>
                  {showRespText && <div style={{ fontSize: '11px', color: 'var(--foreground)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{esc.respuestaTexto}</div>}
                </div>
              )}
            </div>
            {editTiempos && (
              <div style={{ marginTop: '6px', padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corregir tiempos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Envío N{esc.nivel}</div>
                    <input type="datetime-local" value={horaEnvioEdit} onChange={e => setHoraEnvioEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Respuesta</div>
                    <input type="datetime-local" value={horaRespEdit} onChange={e => setHoraRespEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={handleGuardarTiempos} disabled={savingTiempos}
                  style={{ padding: '5px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: savingTiempos ? 'wait' : 'pointer' }}>
                  {savingTiempos ? 'Guardando...' : 'Guardar tiempos'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sin respuesta */}
        {isSinRespuesta && !isRespondido && (
          <div style={{ margin: '0 12px 10px', padding: '7px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>✗ No hubo respuesta del proveedor</div>
          </div>
        )}
      </div>

      {/* ATC */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setShowAtc(v => !v)}
          style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IcoPhone /> Llamadas ATC {(esc.atcLlamadas?.length ?? 0) > 0 ? `(${esc.atcLlamadas.length})` : ''} {showAtc ? '▲' : '▼'}
        </button>
          {showAtc && (
            <div style={{ marginTop: '10px' }}>
              {(esc.atcLlamadas ?? []).map((atc: any) => (
                <AtcLlamadaRow key={atc.id} atc={atc} isClosed={isClosed}
                  onFin={() => finalizarAtc(atc.id)}
                  onSaveNotas={notas => guardarNotasAtc(atc.id, notas)}
                  onSaveHoras={(inicio, fin) => guardarHorasAtc(atc.id, inicio, fin)}
                  onDelete={() => eliminarAtc(atc.id)}
                />
              ))}
              {!isClosed && (
                <button onClick={iniciarAtc}
                  style={{ width: '100%', marginTop: '4px', padding: '7px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <IcoPhone /> Iniciar nueva llamada ATC
                </button>
              )}
            </div>
          )}
      </div>

    </div>
  )
}
