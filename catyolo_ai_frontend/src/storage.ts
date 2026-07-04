import { getConfig } from './config'

const KEYS = {
  apiKey: 'catyolo_api_key',
  backendHost: 'catyolo_backend_host',
  backendPort: 'catyolo_backend_port',
  workerHost: 'catyolo_worker_host',
  workerPort: 'catyolo_worker_port',
} as const

export const storage = {
  getApiKey: () => localStorage.getItem(KEYS.apiKey) ?? '',
  getHost: () => localStorage.getItem(KEYS.backendHost) ?? '',
  getPort: () => localStorage.getItem(KEYS.backendPort) ?? '8000',
  getRawPort: () => localStorage.getItem(KEYS.backendPort),

  getWorkerHost: () => localStorage.getItem(KEYS.workerHost) ?? getConfig().workerHost ?? '',
  getWorkerPort: () => localStorage.getItem(KEYS.workerPort) ?? getConfig().workerPort ?? '5001',

  save(host: string, port: string, apiKey: string) {
    localStorage.setItem(KEYS.backendHost, host)
    localStorage.setItem(KEYS.backendPort, port)
    localStorage.setItem(KEYS.apiKey, apiKey)
  },

  saveWorker(host: string, port: string) {
    localStorage.setItem(KEYS.workerHost, host)
    localStorage.setItem(KEYS.workerPort, port)
  },

  clearApiKey() {
    localStorage.removeItem(KEYS.apiKey)
  },

  hasCredentials() {
    const host = localStorage.getItem(KEYS.backendHost)
    if (!host?.trim()) return false
    if (getConfig().skipAuth) return true
    const key = localStorage.getItem(KEYS.apiKey)
    return key != null && key.trim().length > 0
  },
}
