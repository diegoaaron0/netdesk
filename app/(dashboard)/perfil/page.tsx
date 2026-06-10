'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const INP: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13px',
  border: '0.5px solid var(--border)', borderRadius: '8px',
  background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
}

export default function PerfilPage() {
  const router = useRouter()
  const [form, setForm] = useState({ passwordActual: '', passwordNueva: '', passwordConfirmar: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setOk(false)
    if (form.passwordNueva !== form.passwordConfirmar) { setError('Las contraseñas nuevas no coinciden'); return }
    if (form.passwordNueva.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    setSaving(true)
    const res = await fetch('/api/usuarios/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordActual: form.passwordActual, passwordNueva: form.passwordNueva }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Error al cambiar contraseña'); return }
    setOk(true)
    setForm({ passwordActual: '', passwordNueva: '', passwordConfirmar: '' })
  }

  return (
    <div style={{ maxWidth: '420px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => router.back()}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Mi perfil</h1>
      </div>

      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>
          Cambiar contraseña
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Contraseña actual
            </label>
            <input type="password" value={form.passwordActual} required
              onChange={e => setForm(f => ({ ...f, passwordActual: e.target.value }))} style={INP} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Nueva contraseña
            </label>
            <input type="password" value={form.passwordNueva} required minLength={6}
              onChange={e => setForm(f => ({ ...f, passwordNueva: e.target.value }))} style={INP} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Confirmar nueva contraseña
            </label>
            <input type="password" value={form.passwordConfirmar} required minLength={6}
              onChange={e => setForm(f => ({ ...f, passwordConfirmar: e.target.value }))} style={INP} />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#b91c1c', background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: '7px', padding: '8px 12px' }}>
              {error}
            </div>
          )}
          {ok && (
            <div style={{ fontSize: '12px', color: '#166534', background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: '7px', padding: '8px 12px' }}>
              Contraseña actualizada correctamente.
            </div>
          )}

          <button type="submit" disabled={saving}
            style={{ padding: '9px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginTop: '4px' }}>
            {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
