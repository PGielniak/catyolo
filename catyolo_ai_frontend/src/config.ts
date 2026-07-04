export interface RuntimeConfig {
  skipAuth: boolean
  backendHost: string
  backendPort?: string
  workerHost?: string
  workerPort?: string
}

let _config: RuntimeConfig | null = null

export async function loadConfig(): Promise<RuntimeConfig> {
  if (_config) return _config

  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json() as Partial<RuntimeConfig>
      const backendHost = json.backendHost ?? window.location.hostname
      _config = {
        skipAuth: json.skipAuth ?? (import.meta.env.VITE_SKIP_AUTH === 'true'),
        backendHost,
        backendPort: json.backendPort,
        workerHost: json.workerHost ?? backendHost,
        workerPort: json.workerPort ?? '5001',
      }
      return _config
    }
  } catch {
    // no config.json in dev — fall through to defaults
  }

  const fallbackHost = window.location.hostname
  _config = {
    skipAuth: import.meta.env.VITE_SKIP_AUTH === 'true',
    backendHost: fallbackHost,
    workerHost: fallbackHost,
    workerPort: '5001',
  }
  return _config
}

// Synchronous accessor after loadConfig() has been called
export function getConfig(): RuntimeConfig {
  return _config ?? {
    skipAuth: import.meta.env.VITE_SKIP_AUTH === 'true',
    backendHost: window.location.hostname,
    workerHost: window.location.hostname,
    workerPort: '5001',
  }
}
