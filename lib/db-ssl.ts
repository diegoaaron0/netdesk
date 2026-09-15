/**
 * SSL de la conexión a Postgres.
 *
 * NO se puede decidir solo por NODE_ENV: `next start` siempre pone production,
 * y el Postgres interno de Footloose (LAN, sin certificado) corta la conexión
 * con ECONNRESET apenas el cliente exige TLS — el login fallaba ahí, no en la
 * contraseña. Railway, en cambio, sí lo requiere.
 *
 * Manda la URL:
 *   ...?sslmode=disable   → sin SSL  (servidor propio en LAN)
 *   ...?sslmode=require   → con SSL  (Railway)
 * Sin sslmode explícito se mantiene el comportamiento anterior.
 *
 * Vive en su propio módulo y no en lib/db.ts: importarlo desde
 * drizzle/run-sql.ts arrastraría el pool de lib/db, que se crea al evaluar el
 * módulo.
 */
export function sslDesdeUrl(url: string | undefined): 'require' | false {
  const m = /[?&]sslmode=([a-z-]+)/i.exec(url ?? '')
  if (m) return /^(disable|allow)$/i.test(m[1]) ? false : 'require'
  return process.env.NODE_ENV === 'production' ? 'require' : false
}
