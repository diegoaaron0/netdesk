/**
 * api-mutate.ts — helper de mutaciones para el cliente.
 *
 * Evita el "fallo silencioso": si el backend responde 4xx/5xx, muestra el
 * mensaje de error (campo `error` del body) en lugar de simular que todo salió
 * bien. Usa alert() para mantener consistencia con el resto de la UI mientras no
 * exista un sistema de toasts.
 *
 * Uso:
 *   const { ok, data } = await apiMutate(`/api/incidentes/${id}/resolver`, {
 *     method: 'POST',
 *     json: { resueltoPor },
 *     errorPrefix: 'No se pudo resolver',
 *   })
 *   if (!ok) return
 */
export interface ApiMutateOptions extends Omit<RequestInit, 'body'> {
  /** Cuerpo JSON — se serializa y se setea el header Content-Type automáticamente */
  json?: unknown
  /** Texto que antecede al mensaje de error mostrado (ej. "No se pudo resolver") */
  errorPrefix?: string
  /** Si es true, no muestra alert() en caso de error (el caller maneja el feedback) */
  silent?: boolean
}

export interface ApiMutateResult<T = any> {
  ok: boolean
  status: number
  data: T | null
}

export async function apiMutate<T = any>(
  url: string,
  options: ApiMutateOptions = {},
): Promise<ApiMutateResult<T>> {
  const { json, errorPrefix, silent, headers, ...rest } = options

  const init: RequestInit = { ...rest }
  if (json !== undefined) {
    init.body = JSON.stringify(json)
    init.headers = { 'Content-Type': 'application/json', ...(headers ?? {}) }
  } else if (headers) {
    init.headers = headers
  }

  try {
    const res  = await fetch(url, init)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (!silent) {
        const msg = (data && typeof data === 'object' && 'error' in data && (data as any).error)
          ? (data as any).error
          : `Error ${res.status}`
        alert(errorPrefix ? `${errorPrefix}: ${msg}` : msg)
      }
      return { ok: false, status: res.status, data }
    }
    return { ok: true, status: res.status, data }
  } catch {
    if (!silent) {
      alert(errorPrefix ? `${errorPrefix}: error de conexión. Revisa tu red e intenta de nuevo.` : 'Error de conexión. Revisa tu red e intenta de nuevo.')
    }
    return { ok: false, status: 0, data: null }
  }
}
