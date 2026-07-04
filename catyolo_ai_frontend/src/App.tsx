import { useEffect, useState } from 'react'
import type { Page } from './types'
import { storage } from './storage'
import { loadConfig } from './config'
import SetupPage from './pages/SetupPage'
import HomePage from './pages/HomePage'
import SceneConfigPage from './pages/SceneConfigPage'
import ActionsPage from './pages/ActionsPage'
import DepthTuningPage from './pages/DepthTuningPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>({ name: 'home' })

  useEffect(() => {
    loadConfig().then((cfg) => {
      // config.json (written by serve.py) is authoritative for host/port.
      // Always sync it into storage so stale localStorage values don't send
      // requests to the wrong host or bypass the proxy.
      const host = cfg.backendHost || storage.getHost()
      const port = cfg.backendPort || storage.getPort()
      storage.save(host, port, storage.getApiKey())
      storage.saveWorker(cfg.workerHost || host, cfg.workerPort || '5001')

      setPage(storage.hasCredentials() ? { name: 'home' } : { name: 'setup' })
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading…
      </div>
    )
  }

  function navigate(p: Page) {
    setPage(p)
  }

  switch (page.name) {
    case 'setup':
      return <SetupPage onDone={() => navigate({ name: 'home' })} />

    case 'home':
      return <HomePage navigate={navigate} />

    case 'sceneConfig':
      return <SceneConfigPage scene={page.scene} navigate={navigate} />

    case 'actions':
      return <ActionsPage navigate={navigate} />

    case 'depthTuning':
      return <DepthTuningPage navigate={navigate} />

    case 'settings':
      return (
        <SettingsPage
          navigate={navigate}
          onLogout={() => navigate({ name: 'setup' })}
        />
      )
  }
}
