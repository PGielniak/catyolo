import { useState } from 'react'
import { api, ApiKeyAuthError, BackendError } from '../api'
import { storage } from '../storage'
import { getConfig } from '../config'

interface Props {
  onDone: () => void
}

export default function SetupPage({ onDone }: Props) {
  const { skipAuth, backendHost: suggestedHost, backendPort: suggestedPort } = getConfig()
  const [host, setHost] = useState(storage.getHost() || suggestedHost)
  const [port, setPort] = useState(storage.getRawPort() ?? suggestedPort ?? '8000')
  const [apiKey, setApiKey] = useState(storage.getApiKey())
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (!skipAuth) {
        await api.validateApiKey(host.trim(), port.trim(), apiKey.trim())
      }
      storage.save(host.trim(), port.trim(), skipAuth ? '' : apiKey.trim())
      onDone()
    } catch (err) {
      if (err instanceof ApiKeyAuthError) {
        setError('Invalid API key. Please check and try again.')
      } else if (err instanceof BackendError) {
        setError(`Backend error: ${err.message}`)
      } else {
        setError(`Cannot reach backend: ${String(err)}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Catyolo AI</h1>
        <p className="text-center text-gray-500 mb-8">
          Welcome! Fill in your credentials to get started.
        </p>

        {skipAuth && (
          <div className="mb-6 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            Dev mode — API key validation disabled
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h2 className="font-semibold mb-3">Backend Server</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">IP Address</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="192.168.1.100"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="8000"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          {!skipAuth && (
            <section>
              <h2 className="font-semibold mb-3">API Key</h2>
              <div className="relative">
                <input
                  className="w-full border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type={showKey ? 'text' : 'password'}
                  placeholder="Enter API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? '🙈' : '👁️'}
                </button>
              </div>
            </section>
          )}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Connecting…' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
