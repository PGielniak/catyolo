import { useEffect, useState } from 'react'
import { sceneService } from '../services/sceneService'
import type { Scene, Page } from '../types'

interface Props {
  navigate: (p: Page) => void
}

export default function HomePage({ navigate }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)

  async function load() {
    setError(null)
    setLoading(true)
    try {
      setScenes(await sceneService.loadAll())
    } catch (err) {
      setError(`Could not load scenes: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAnalyze(scene: Scene) {
    setAnalyzing(scene.id)
    try {
      const msg = await sceneService.analyze(scene.id)
      setAnalysisResult(msg)
    } catch (err) {
      setAnalysisResult(`Analysis failed: ${String(err)}`)
    } finally {
      setAnalyzing(null)
    }
  }

  async function handleDelete(scene: Scene) {
    if (!confirm(`Delete scene "${scene.name || `${scene.cameraHost}:${scene.cameraPort}`}"?`)) return
    try {
      await sceneService.delete(scene.id)
      load()
    } catch (err) {
      alert(`Delete failed: ${String(err)}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">Catyolo AI</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate({ name: 'depthTuning' })}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="Depth tuning"
          >
            🎛️
          </button>
          <button
            onClick={() => navigate({ name: 'settings' })}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center items-center py-20 text-gray-400">Loading…</div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-600 mb-4">{error}</p>
            <button onClick={load} className="btn-primary">Retry</button>
          </div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📷</div>
            <p className="mb-6">No scenes configured</p>
            <button
              onClick={() => navigate({ name: 'sceneConfig' })}
              className="btn-primary"
            >
              + Configure Scene
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y bg-white rounded-xl shadow-sm overflow-hidden">
              {scenes.map((scene) => (
                <div key={scene.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl">🎥</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {scene.name || `${scene.cameraHost}:${scene.cameraPort}`}
                    </p>
                    <p className="text-sm text-gray-500">
                       {scene.cameraHost}:{scene.cameraPort} · {(scene.zones ?? scene.rects ?? []).length} zone{(scene.zones ?? scene.rects ?? []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleAnalyze(scene)}
                      disabled={analyzing === scene.id}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                      title="Analyze"
                    >
                      {analyzing === scene.id ? '⏳' : '🔍'}
                    </button>
                    <button
                      onClick={() => navigate({ name: 'sceneConfig', scene })}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(scene)}
                      className="p-1.5 rounded hover:bg-gray-100 text-red-500"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate({ name: 'sceneConfig' })}
              className="btn-primary w-full mt-4"
            >
              + Add Scene
            </button>
          </>
        )}
      </main>

      {/* Analysis result modal */}
      {analysisResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h2 className="font-bold text-lg mb-3">Analysis Result</h2>
            <p className="text-gray-700 mb-5">{analysisResult}</p>
            <button
              onClick={() => setAnalysisResult(null)}
              className="btn-primary w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
