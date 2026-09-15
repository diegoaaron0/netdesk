import { describe, it, expect, afterEach } from 'vitest'
import { sslDesdeUrl } from './db-ssl'

const ENV = process.env.NODE_ENV
afterEach(() => { (process.env as any).NODE_ENV = ENV })

describe('sslDesdeUrl', () => {
  it('sslmode=disable apaga SSL aunque sea produccion', () => {
    ;(process.env as any).NODE_ENV = 'production'
    // El Postgres en LAN de Footloose no habla TLS: exigirlo daba ECONNRESET
    // y el login moria ahi, no en la contraseña.
    expect(sslDesdeUrl('postgresql://u:p@192.168.3.20:5432/db?sslmode=disable')).toBe(false)
  })

  it('sslmode=require lo exige aunque no sea produccion', () => {
    ;(process.env as any).NODE_ENV = 'development'
    expect(sslDesdeUrl('postgresql://u:p@host/db?sslmode=require')).toBe('require')
  })

  it('sin sslmode mantiene el comportamiento anterior', () => {
    ;(process.env as any).NODE_ENV = 'production'
    expect(sslDesdeUrl('postgresql://u:p@host/db')).toBe('require')
    ;(process.env as any).NODE_ENV = 'development'
    expect(sslDesdeUrl('postgresql://u:p@host/db')).toBe(false)
  })

  it('tolera URL vacia o ausente', () => {
    ;(process.env as any).NODE_ENV = 'development'
    expect(sslDesdeUrl(undefined)).toBe(false)
    expect(sslDesdeUrl('')).toBe(false)
  })
})
