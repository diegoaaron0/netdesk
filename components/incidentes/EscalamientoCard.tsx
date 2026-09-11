'use client'
import { useState, useEffect, useRef } from 'react'
import { apiMutate } from '@/lib/api-mutate'
import { AdjuntosZona, compressImage } from '@/components/incidentes/AdjuntosZona'
import { CronometroEscalamiento } from '@/components/incidentes/CronometroEscalamiento'
import { buildCorreo, toDatetimeLocal, fromDatetimeLocal, minToHM } from '@/components/incidentes/helpers'
import { parseEtaMin } from '@/lib/sla-core'
import { MAX_ADJUNTOS, MAX_ADJUNTO_BYTES, TIPOS_ADJUNTO } from '@/lib/correo-escalamiento'

const IcoTrashEsc = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IcoPhone  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43A2 2 0 0 1 3.6 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.84a16 16 0 0 0 6.07 6.07l.96-1.06a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>

function AtcLlamadaRow({ atc, isClosed, onFin, onSaveNotas, onDelete }: {
  atc: any; isClosed: boolean; onFin: () => void; onSaveNotas: (n: string) => void; onDelete: () => void
}) {
  const [notas, setNotas] = useState(atc.notas ?? '')
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
            : <span style={{ fontSize: '10px', color: 'var(--ok)', fontWeight: 500 }}>● En curso</span>}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {!atc.fin && !isClosed && (
            <button onClick={onFin} style={{ padding: '2px 8px', fontSize: '10px', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', cursor: 'pointer' }}>
              ■ Finalizar
            </button>
          )}
          {!isClosed && (
            <button onClick={onDelete} style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: 'var(--danger)', cursor: 'pointer' }}>
              <IcoTrashEsc />
            </button>
          )}
        </div>
      </div>
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

  // Adjuntos del correo: viven solo hasta que se manda. No son los adjuntos del
  // incidente (esos son AdjuntosZona y quedan guardados).
  const [adjCorreo, setAdjCorreo] = useState<Array<{ nombre: string; tipo: string; dataUrl: string; bytes: number }>>([])
  const [enviando, setEnviando]   = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [avisoEnvio, setAvisoEnvio] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const nivelData  = inc.nivelesProveedor?.find((n: any) => n.nivel === esc.nivel)
  const prevEscs   = allEscs.filter((e: any) => e.nivel < esc.nivel).sort((a: any, b: any) => a.nivel - b.nivel)
  const copias: string[] = (nivelData?.correosCopia ?? []).filter(Boolean)
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

  async function agregarAdjuntos(files: FileList | null) {
    if (!files?.length) return
    setErrorEnvio('')
    const nuevos: typeof adjCorreo = []
    for (const file of Array.from(files)) {
      if (adjCorreo.length + nuevos.length >= MAX_ADJUNTOS) {
        setErrorEnvio(`Máximo ${MAX_ADJUNTOS} adjuntos por correo.`); break
      }
      if (!TIPOS_ADJUNTO.includes(file.type)) {
        setErrorEnvio(`"${file.name}" no es JPG, PNG ni WebP.`); continue
      }
      if (file.size > MAX_ADJUNTO_BYTES) {
        setErrorEnvio(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es 5 MB.`); continue
      }
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader()
        r.onload = ev => res(ev.target!.result as string)
        r.readAsDataURL(file)
      })
      nuevos.push({ nombre: file.name, tipo: file.type, dataUrl, bytes: file.size })
    }
    if (nuevos.length) setAdjCorreo(a => [...a, ...nuevos])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleEnviarCorreo() {
    setEnviando(true)
    setErrorEnvio('')
    const res = await fetch(`/api/escalamientos/${esc.id}/enviar-correo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuerpo: templateBody,
        adjuntos: adjCorreo.map(a => ({ nombre: a.nombre, tipo: a.tipo, dataUrl: a.dataUrl })),
      }),
    }).catch(() => null)
    setEnviando(false)

    if (!res?.ok) {
      // El error del servidor se muestra tal cual: distingue "SMTP rechazó" de
      // "falta configuración" de "el nivel no tiene correo". Sin sellar nada,
      // así el agente puede corregir y reintentar.
      const data = await res?.json().catch(() => null)
      setErrorEnvio(data?.error ?? 'No se pudo enviar el correo. Revisá la conexión y reintentá.')
      return
    }
    const data = await res.json().catch(() => null)
    setAdjCorreo([])
    // Modo prueba (SMTP_OVERRIDE_TO): el correo NO llegó al proveedor.
    setAvisoEnvio(data?.redirigidoA?.length
      ? `Modo prueba: el correo se desvió a ${data.redirigidoA.join(', ')}. El proveedor NO lo recibió.`
      : '')
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
    <div style={{ background: 'var(--muted)', borderRadius: '12px', border: `1px solid ${isRespondido ? 'var(--ok-border)' : isSinRespuesta ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, overflow: 'hidden' }}>

      {/* ── Header compacto ── */}
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>N{esc.nivel}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{esc.contactoEscalado}</span>
              {isRespondido  && <span style={{ fontSize: '10px', padding: '1px 7px', background: 'var(--ok-bg)', color: 'var(--ok)', borderRadius: '20px', fontWeight: 600 }}>Respondido</span>}
              {isSinRespuesta && <span style={{ fontSize: '10px', padding: '1px 7px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '20px', fontWeight: 600 }}>Sin respuesta</span>}
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
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: editTiempos ? 'var(--info-bg)' : 'rgba(0,0,0,0.06)', border: `1px solid ${editTiempos ? 'var(--info-border)' : 'var(--border)'}`, borderRadius: '4px', color: editTiempos ? 'var(--info-bg)' : 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px' }}>✎</button>
            )}
            {!isClosed && (
              <button onClick={handleDelete} title="Eliminar"
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: 'var(--danger)', cursor: 'pointer' }}>
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
                style={{ fontSize: '10px', padding: '2px 8px', background: copied ? 'var(--ok-bg)' : 'transparent', color: copied ? 'var(--ok-bg)' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
              {!isClosed && <button onClick={() => setTemplateBody(buildCorreo(inc, nivelData, esc.nivel, prevEscs))}
                style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>🔄 Actualizar</button>}
              {showTemplate && !isClosed && (
                <button onClick={saveTemplate} disabled={savingTemplate}
                  style={{ fontSize: '10px', padding: '2px 8px', background: savingTemplate ? 'var(--muted)' : 'var(--gradient-primary)', color: savingTemplate ? 'var(--muted-foreground)' : 'white', border: 'none', borderRadius: '4px', cursor: savingTemplate ? 'wait' : 'pointer' }}>
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

        {/* ── Envío del correo ── */}
        {!isClosed && !isSinRespuesta && (
          <div style={{ marginBottom: '6px' }}>

            {/* Destinatarios */}
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '6px', lineHeight: 1.6 }}>
              <div><span style={{ color: 'var(--faint-foreground)' }}>Para:</span> {esc.emailContacto || <span style={{ color: 'var(--danger)' }}>sin correo en la ficha</span>}</div>
              {copias.length > 0 && <div><span style={{ color: 'var(--faint-foreground)' }}>CC:</span> {copias.join(', ')}</div>}
            </div>

            {/* Adjuntos del correo */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={adjCorreo.length >= MAX_ADJUNTOS}
                  style={{ fontSize: '10px', padding: '3px 9px', background: 'transparent', color: adjCorreo.length >= MAX_ADJUNTOS ? 'var(--faint-foreground)' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '5px', cursor: adjCorreo.length >= MAX_ADJUNTOS ? 'not-allowed' : 'pointer' }}>
                  📎 Adjuntar imagen
                </button>
                <span style={{ fontSize: '9px', color: 'var(--faint-foreground)' }}>
                  {adjCorreo.length}/{MAX_ADJUNTOS} · JPG, PNG o WebP · máx 5 MB c/u
                </span>
              </div>
              <input ref={fileRef} type="file" accept={TIPOS_ADJUNTO.join(',')} multiple hidden
                onChange={e => agregarAdjuntos(e.target.files)} />

              {adjCorreo.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {adjCorreo.map((a, i) => (
                    <div key={i} style={{ position: 'relative', width: '58px' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.nombre}
                        style={{ width: '58px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)', display: 'block' }} />
                      <button type="button" title={`Quitar ${a.nombre}`}
                        onClick={() => setAdjCorreo(list => list.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: '-5px', right: '-5px', width: '17px', height: '17px', lineHeight: 1, borderRadius: '50%', border: '1px solid var(--danger-border)', background: 'var(--card)', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        ×
                      </button>
                      <div style={{ fontSize: '8px', color: 'var(--faint-foreground)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(a.bytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {avisoEnvio && (
              <div style={{ fontSize: '10px', color: 'var(--warn)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: '6px', padding: '6px 9px', marginBottom: '6px', lineHeight: 1.5 }}>
                ⚠ {avisoEnvio}
              </div>
            )}

            {errorEnvio && (
              <div style={{ fontSize: '10px', color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '6px', padding: '6px 9px', marginBottom: '6px', lineHeight: 1.5 }}>
                {errorEnvio}
              </div>
            )}

            {esc.horaEnvioCorreo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ flex: 1, fontSize: '11px', color: 'var(--ok)', fontWeight: 600 }}>
                  ✓ Enviado a las {new Date(esc.horaEnvioCorreo).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button onClick={handleEnviarCorreo} disabled={enviando || !esc.emailContacto}
                  style={{ padding: '6px 12px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: enviando ? 'wait' : 'pointer' }}>
                  {enviando ? 'Enviando…' : '↻ Reenviar'}
                </button>
              </div>
            ) : (
              <>
                <button onClick={handleEnviarCorreo} disabled={enviando || !esc.emailContacto}
                  className="nd-btn-primary"
                  style={{ width: '100%', padding: '9px', fontSize: '12px', marginBottom: '5px' }}>
                  {enviando ? 'Enviando…' : '✉ Enviar correo al proveedor'}
                </button>
                <button onClick={handleEnvio}
                  style={{ width: '100%', padding: '7px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
                  Ya lo mandé por fuera → solo iniciar cronómetro
                </button>
              </>
            )}
          </div>
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
                  style={{ flex: 1, padding: '8px', background: 'var(--ok-bg)', color: 'var(--ok)', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
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
            <div style={{ padding: '8px 12px', background: 'var(--ok-bg)', borderRadius: '8px', border: '1px solid var(--ok-border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ok)' }}>
                ✓ {minToHM(esc.tiempoRespuestaMin)} · {new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                {esc.tiempoEstimadoSolucion && (() => {
                  const m = parseEtaMin(esc.tiempoEstimadoSolucion)
                  return <span style={{ fontWeight: 400, marginLeft: '8px' }}>· ETA: {m != null ? minToHM(m) : esc.tiempoEstimadoSolucion}</span>
                })()}
              </div>
              {esc.respuestaTexto && (
                <div style={{ marginTop: '4px' }}>
                  <button type="button" onClick={() => setShowRespText(v => !v)}
                    style={{ fontSize: '10px', color: 'var(--ok)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                    {showRespText ? '▲ Ocultar' : '▼ Ver respuesta'}
                  </button>
                  {showRespText && <div style={{ fontSize: '11px', color: 'var(--foreground)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{esc.respuestaTexto}</div>}
                </div>
              )}
            </div>
            {editTiempos && (
              <div style={{ marginTop: '6px', padding: '8px 12px', background: 'var(--info-bg)', borderRadius: '8px', border: '1px solid var(--info-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corregir tiempos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}>Envío N{esc.nivel}</div>
                    <input type="datetime-local" value={horaEnvioEdit} onChange={e => setHoraEnvioEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid var(--info-border)', borderRadius: '6px', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}>Respuesta</div>
                    <input type="datetime-local" value={horaRespEdit} onChange={e => setHoraRespEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid var(--info-border)', borderRadius: '6px', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={handleGuardarTiempos} disabled={savingTiempos}
                  style={{ padding: '5px', background: 'var(--info-bg)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: savingTiempos ? 'wait' : 'pointer' }}>
                  {savingTiempos ? 'Guardando...' : 'Guardar tiempos'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sin respuesta */}
        {isSinRespuesta && !isRespondido && (
          <div style={{ margin: '0 12px 10px', padding: '7px 12px', background: 'var(--danger-bg)', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--danger)' }}>✗ No hubo respuesta del proveedor</div>
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
