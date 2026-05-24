import { NextRequest, NextResponse } from 'next/server'

export function apiKeyAuth(req: NextRequest): NextResponse | null {
  const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('key')
  if (!process.env.PBI_API_KEY || key !== process.env.PBI_API_KEY) {
    return NextResponse.json({ error: 'API key inválida o ausente' }, { status: 401 })
  }
  return null
}

export function parseDateRange(searchParams: URLSearchParams) {
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')
  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : '2020-01-01T00:00:00.000Z'
  return { desde, hasta }
}
