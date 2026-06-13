/**
 * db-errors.ts — manejo uniforme de errores de queries que degradan a parcial.
 *
 * Varias rutas envuelven queries en try/catch para tolerar columnas que aún no
 * existen en algún entorno (patrón "columns not migrated yet"). El problema es
 * que un `catch {}` vacío también traga errores REALES (timeout, deadlock, SQL
 * inválido) y los disfraza de "sin datos", dejando el debugging a ciegas.
 *
 * Este helper loguea el error para darle visibilidad, SALVO que sea el caso
 * esperado de columna/tabla aún no migrada (Postgres 42703 / 42P01). No re-lanza:
 * preserva la degradación elegante de las páginas de detalle/dashboard.
 */

// 42703 = undefined_column, 42P01 = undefined_table
const SCHEMA_MISSING_CODES = new Set(['42703', '42P01'])

export function logUnlessSchemaMissing(context: string, err: unknown): void {
  const code = (err as { code?: string } | null)?.code
  if (code && SCHEMA_MISSING_CODES.has(code)) return // esperado: columna/tabla no migrada
  console.error(`[${context}] query degradada a parcial:`, err)
}
