import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// Auditoría transversal (permisos): dos veces en el historial faltó can() en
// rutas nuevas (commits aac4f89 y 66d1f72) y se detectó recién en una revisión
// manual posterior. Este test escanea TODAS las rutas de app/api/**/route.ts y
// falla si algún método exportado (GET/POST/PUT/PATCH/DELETE) no llama a can()
// y tampoco está en la lista de excepciones documentadas de abajo — así una
// ruta nueva sin protección rompe la suite en vez de esperar a una auditoría.

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// Excepciones documentadas — cada una tiene otra forma de protección distinta
// de can(), confirmada leyendo el archivo real (no es una lista de "por si acaso").
const EXCEPCIONES: Record<string, string[]> = {
  'app/api/auth/[...nextauth]/route.ts': ['GET', 'POST'], // handler de NextAuth (export const { GET, POST } = handlers) — es el propio proveedor de autenticación, no pasa por can()
  'app/api/cron/sla-alert/route.ts': ['GET'], // protegido por CRON_SECRET (header Bearer), no por sesión/permiso de usuario
  'app/api/usuarios/me/password/route.ts': ['PATCH'], // requiere sesión (auth()) pero cualquier usuario autenticado puede cambiar SU PROPIA contraseña — no requiere un permiso específico
  'app/api/usuarios/publico/route.ts': ['GET'], // listado público (solo id/nombre/email de usuarios activos, sin datos sensibles) para poblar selects — sin auth a propósito
  'app/api/v1/incidentes/route.ts': ['GET'], // API pública externa, protegida por apiKeyAuth (API key), no por sesión/can()
  'app/api/v1/proveedores/route.ts': ['GET'], // idem — apiKeyAuth
  'app/api/v1/tiendas/route.ts': ['GET'], // idem — apiKeyAuth
}

function findRouteFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) findRouteFiles(p, out)
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

// Extrae los métodos exportados de dos formas posibles:
//  1. `export async function GET(...)` / `export function GET(...)` — el caso normal.
//  2. `export const { GET, POST } = handlers` — reexport de un handler externo (ej. NextAuth).
// Para (1) se devuelve también el cuerpo de la función (hasta el próximo export), para
// poder buscar can() ahí dentro. Para (2) no hay cuerpo que inspeccionar — esos métodos
// SIEMPRE deben estar en EXCEPCIONES, nunca se consideran protegidos automáticamente.
function extractMethods(source: string): { method: string; body: string | null }[] {
  const results: { method: string; index: number; body: string | null }[] = []

  const fnPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g
  let m: RegExpExecArray | null
  const fnMatches: { method: string; index: number }[] = []
  while ((m = fnPattern.exec(source))) fnMatches.push({ method: m[1], index: m.index })
  fnMatches.forEach((cur, i) => {
    const end = i + 1 < fnMatches.length ? fnMatches[i + 1].index : source.length
    results.push({ method: cur.method, index: cur.index, body: source.slice(cur.index, end) })
  })

  const reexportPattern = /export\s+const\s+\{([^}]+)\}\s*=/g
  while ((m = reexportPattern.exec(source))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim()
      if ((METHODS as readonly string[]).includes(name)) {
        results.push({ method: name, index: m.index, body: null })
      }
    }
  }

  return results.map(({ method, body }) => ({ method, body }))
}

describe('Cobertura de can() en rutas API (Paso 6 — auditoría transversal)', () => {
  const apiDir = join(process.cwd(), 'app/api')
  const files = findRouteFiles(apiDir)

  it('encontró rutas para auditar (evita que un cambio de estructura de carpetas deje el test vacío y siempre en verde)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('toda ruta nueva sin can() debe estar en la lista explícita de EXCEPCIONES de este archivo', () => {
    const faltantes: string[] = []

    for (const file of files) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/')
      const source = readFileSync(file, 'utf8')
      const methods = extractMethods(source)
      const excepcionesArchivo = EXCEPCIONES[rel] ?? []

      for (const { method, body } of methods) {
        if (excepcionesArchivo.includes(method)) continue
        const protegido = body !== null && /\bcan\(/.test(body)
        if (!protegido) faltantes.push(`${rel} :: ${method}`)
      }
    }

    expect(faltantes, `Rutas sin can() ni excepción documentada:\n${faltantes.join('\n')}`).toEqual([])
  })

  it('las excepciones documentadas siguen existiendo hoy (si se borra la ruta, hay que borrar la excepción)', () => {
    for (const rel of Object.keys(EXCEPCIONES)) {
      const abs = join(process.cwd(), rel)
      expect(() => statSync(abs), `La excepción "${rel}" ya no existe — bórrala de EXCEPCIONES`).not.toThrow()
    }
  })
})
