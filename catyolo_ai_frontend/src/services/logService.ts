import { api } from '../api'

const SUPPORTED_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
export type LogLevel = typeof SUPPORTED_LEVELS[number]

function normalizeLevel(value: string): LogLevel {
  const upper = value.trim().toUpperCase()
  if (SUPPORTED_LEVELS.includes(upper as LogLevel)) return upper as LogLevel
  for (const lvl of SUPPORTED_LEVELS) {
    if (upper.includes(lvl)) return lvl
  }
  throw new Error(`Unsupported log level: ${value}`)
}

export const logService = {
  supportedLevels: SUPPORTED_LEVELS,

  async getLogs(lines: number): Promise<string[]> {
    const result = await api.get<unknown[]>(`/log/get/${lines}`)
    return result.map(String)
  },

  async getLogLevel(): Promise<LogLevel> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await api.get<any>('/log/get_log_level')
    if (typeof result === 'string') return normalizeLevel(result)
    for (const key of ['level', 'log_level', 'current_log_level', 'message']) {
      if (typeof result[key] === 'string') return normalizeLevel(result[key])
    }
    throw new Error(`Unexpected log level response: ${JSON.stringify(result)}`)
  },

  async setLogLevel(level: LogLevel): Promise<void> {
    await api.post('/log/set_log_level', undefined, { level })
  },
}
