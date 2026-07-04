import { useEffect, useState } from 'react'
import type { Page } from '../types'
import { api, ApiKeyAuthError, BackendError } from '../api'
import { storage } from '../storage'
import { getConfig } from '../config'
import { logService, type LogLevel } from '../services/logService'

interface Props {
  navigate: (p: Page) => void
  onLogout: () => void
}

export default function SettingsPage({ navigate, onLogout }: Props) {
  const [host, setHost] = useState(storage.getHost())
  const [port, setPort] = useState(storage.getPort())
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Logs
  const [logLines, setLogLines] = useState('100')
  const [logs, setLogs] = useState<string[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsMsg, setLogsMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Log level
  const [currentLevel, setCurrentLevel] = useState<LogLevel | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | null>(null)
  const [loadingLevel, setLoadingLevel] = useState(false)
  const [updatingLevel, setUpdatingLevel] = useState(false)
  const [levelMsg, setLevelMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (host && port) refreshLevel(false)
  }, [])

  async function saveBackend(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    storage.save(host.trim(), port.trim(), storage.getApiKey())
    setSaving(false)
    setTestMsg({ ok: true, text: 'Backend configuration saved.' })
  }

  async function testConnection() {
    setTesting(true)
    setTestMsg(null)
    try {
      if (getConfig().skipAuth) {
        // In skip-auth mode just verify the backend is reachable via the proxy
        await api.get('/scene/')
      } else {
        await api.validateApiKey(host.trim(), port.trim(), storage.getApiKey())
      }
      setTestMsg({ ok: true, text: 'Connection successful!' })
    } catch (err) {
      if (err instanceof ApiKeyAuthError) {
        setTestMsg({ ok: false, text: 'API key is invalid or unauthorized.' })
      } else if (err instanceof BackendError) {
        setTestMsg({ ok: false, text: `Backend down or misconfigured: ${err.message}` })
      } else {
        setTestMsg({ ok: false, text: `Cannot reach backend: ${String(err)}` })
      }
    } finally {
      setTesting(false)
    }
  }

  async function fetchLogs() {
    const n = parseInt(logLines, 10)
    if (!n || n < 1) return
    setLoadingLogs(true)
    setLogsMsg(null)
    try {
      const lines = await logService.getLogs(n)
      setLogs(lines)
      setLogsMsg({ ok: true, text: `Loaded ${lines.length} log line(s).` })
    } catch (err) {
      setLogsMsg({ ok: false, text: `Failed to load logs: ${String(err)}` })
    } finally {
      setLoadingLogs(false)
    }
  }

  async function refreshLevel(showError = true) {
    setLoadingLevel(true)
    setLevelMsg(null)
    try {
      const lvl = await logService.getLogLevel()
      setCurrentLevel(lvl)
      setSelectedLevel((s) => s ?? lvl)
      setLevelMsg({ ok: true, text: `Current log level: ${lvl}` })
    } catch (err) {
      if (showError) setLevelMsg({ ok: false, text: `Failed to read log level: ${String(err)}` })
    } finally {
      setLoadingLevel(false)
    }
  }

  async function applyLevel() {
    if (!selectedLevel) return
    setUpdatingLevel(true)
    setLevelMsg(null)
    try {
      await logService.setLogLevel(selectedLevel)
      const confirmed = await logService.getLogLevel()
      setCurrentLevel(confirmed)
      setSelectedLevel(confirmed)
      setLevelMsg({ ok: true, text: `Log level updated to ${confirmed}` })
    } catch (err) {
      setLevelMsg({ ok: false, text: `Failed to update log level: ${String(err)}` })
    } finally {
      setUpdatingLevel(false)
    }
  }

  function reconfigureApiKey() {
    if (!confirm('This will erase your saved API key and require you to enter a new one. Continue?')) return
    storage.clearApiKey()
    onLogout()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ name: 'home' })} className="text-gray-500 hover:text-gray-800">←</button>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-8">
        {/* Backend */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-base mb-4">Backend Server</h2>
          <form onSubmit={saveBackend} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">IP Address</label>
                <input
                  className="field"
                  value={host}
                  onChange={(e) => { setHost(e.target.value); setTestMsg(null) }}
                  required
                />
              </div>
              <div className="w-24">
                <label className="text-sm font-medium block mb-1">Port</label>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => { setPort(e.target.value); setTestMsg(null) }}
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={testConnection} disabled={testing} className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {testing ? 'Testing…' : '📶 Test Connection'}
              </button>
            </div>
          </form>
          {testMsg && (
            <p className={`mt-3 text-sm ${testMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {testMsg.ok ? '✓' : '✗'} {testMsg.text}
            </p>
          )}
        </section>

        {/* Alerts */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-base mb-4">Alerts</h2>
          <button
            onClick={() => navigate({ name: 'actions' })}
            className="w-full border rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
          >
            ⚡ Configure Actions
          </button>
        </section>

        {/* Logs */}
        <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-base">Logs</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Lines to retrieve</label>
              <input
                className="field"
                type="number"
                min={1}
                value={logLines}
                onChange={(e) => setLogLines(e.target.value)}
              />
            </div>
            <button
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="border rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingLogs ? 'Loading…' : '📋 Get Logs'}
            </button>
          </div>
          {logsMsg && (
            <p className={`text-sm ${logsMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{logsMsg.text}</p>
          )}
          <div className="border rounded-lg p-3 h-48 overflow-y-auto bg-gray-900 text-gray-100 font-mono text-xs">
            {logs.length === 0 ? (
              <span className="text-gray-500">No logs loaded yet.</span>
            ) : (
              logs.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>

          {/* Log level */}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">
              Current log level: <span className="font-bold">{currentLevel ?? 'unknown'}</span>
            </p>
            <div className="flex gap-3 items-center">
              <select
                className="field flex-1"
                value={selectedLevel ?? ''}
                onChange={(e) => setSelectedLevel(e.target.value as LogLevel)}
              >
                <option value="" disabled>Select log level</option>
                {logService.supportedLevels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button
                onClick={applyLevel}
                disabled={updatingLevel || !selectedLevel}
                className="border rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                {updatingLevel ? 'Applying…' : 'Apply'}
              </button>
              <button
                onClick={() => refreshLevel()}
                disabled={loadingLevel}
                className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                title="Refresh log level"
              >
                🔄
              </button>
            </div>
          </div>
          {levelMsg && (
            <p className={`text-sm ${levelMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{levelMsg.text}</p>
          )}
        </section>

        {/* Danger zone */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <button
            onClick={reconfigureApiKey}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            🗑️ Reconfigure API Key
          </button>
        </section>
      </main>
    </div>
  )
}
