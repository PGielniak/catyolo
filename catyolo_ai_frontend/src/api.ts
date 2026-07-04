import { storage } from './storage'
import { getConfig } from './config'

export class ApiKeyAuthError extends Error {}
export class BackendError extends Error {}

function makeHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  }
  if (!getConfig().skipAuth) headers['X-API-Key'] = storage.getApiKey()
  return headers
}

function baseUrl() {
  return `http://${storage.getHost()}:${storage.getPort()}`
}

async function checkStatus(res: Response): Promise<void> {
  if (res.status === 401 || res.status === 403) throw new ApiKeyAuthError()
  if (!res.ok) throw new BackendError(`Server returned ${res.status}: ${await res.text()}`)
}

export const api = {
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(baseUrl() + path)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url, { headers: makeHeaders(), signal: AbortSignal.timeout(15000) })
    await checkStatus(res)
    const text = await res.text()
    return text.trim() ? (JSON.parse(text) as T) : (null as T)
  },

  async post<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const url = new URL(baseUrl() + path)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url, {
      method: 'POST',
      headers: makeHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    await checkStatus(res)
    const text = await res.text()
    return text.trim() ? (JSON.parse(text) as T) : (null as T)
  },

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(baseUrl() + path, {
      method: 'PATCH',
      headers: makeHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    await checkStatus(res)
    const text = await res.text()
    return text.trim() ? (JSON.parse(text) as T) : (null as T)
  },

  async delete(path: string): Promise<void> {
    const res = await fetch(baseUrl() + path, {
      method: 'DELETE',
      headers: makeHeaders(),
      signal: AbortSignal.timeout(15000),
    })
    await checkStatus(res)
  },

  async validateApiKey(host: string, port: string, apiKey: string): Promise<void> {
    const url = `http://${host}:${port}/api_key/validate`
    const res = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ raw_key: apiKey }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401 || res.status === 403) throw new ApiKeyAuthError()
    if (!res.ok) throw new BackendError(`Server returned ${res.status}`)
  },
}
