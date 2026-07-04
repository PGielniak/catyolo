import { useEffect, useRef, useState } from 'react'
import type { Page } from '../types'
import { sceneService } from '../services/sceneService'
import type { Scene } from '../types'
import { storage } from '../storage'
import { workerApi, type DepthTuning } from '../services/workerApi'

interface Props {
  navigate: (p: Page) => void
}

interface Knob {
  key: keyof DepthTuning
  label: string
  hint: string
  min: number
  max: number
  step: number
}

const KNOBS: Knob[] = [
  { key: 'depth_diff_threshold', label: 'Frame-diff threshold', hint: 'Mean pixel change below this reuses the last depth map. Higher = more reuse (less flicker, more lag).', min: 0, max: 50, step: 0.5 },
  { key: 'depth_diff_downsample', label: 'Frame-diff downsample', hint: 'Diff is computed on every Nth pixel. Higher = faster, coarser motion detection.', min: 1, max: 32, step: 1 },
  { key: 'depth_smooth_window', label: 'Temporal median window', hint: 'Number of frames averaged by median. Higher = more stable, more lag.', min: 1, max: 15, step: 1 },
  { key: 'depth_guided_radius', label: 'Guided filter radius', hint: 'Spatial smoothing window. Higher = smoother flats, blurrier edges.', min: 1, max: 30, step: 1 },
  { key: 'depth_guided_eps', label: 'Guided filter eps', hint: 'Edge sensitivity. Higher = more smoothing across edges.', min: 0.001, max: 0.2, step: 0.001 },
]

export default function DepthTuningPage({ navigate }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [tuning, setTuning] = useState<DepthTuning | null>(null)
  const [loadingTuning, setLoadingTuning] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [depthShow, setDepthShow] = useState<boolean | null>(null)

  const [workerHost, setWorkerHost] = useState(storage.getWorkerHost())
  const [workerPort, setWorkerPort] = useState(storage.getWorkerPort())

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Partial<DepthTuning>>({})

  useEffect(() => {
    sceneService.loadAll().then(setScenes).catch((e) => setMsg({ ok: false, text: `Could not load scenes: ${String(e)}` }))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoadingTuning(true)
    setDepthShow(null)
    setMsg(null)
    workerApi
      .getDepthTuning(selectedId)
      .then((t) => setTuning(t))
      .catch((e) => setMsg({ ok: false, text: `Worker unreachable: ${String(e)}` }))
      .finally(() => setLoadingTuning(false))
  }, [selectedId, workerHost, workerPort])

  function flushPending(sceneId: string) {
    const params = pendingRef.current
    pendingRef.current = {}
    if (Object.keys(params).length === 0) return
    workerApi
      .setDepthTuning(sceneId, params)
      .then((t) => {
        setTuning(t)
        setMsg({ ok: true, text: 'Applied.' })
      })
      .catch((e) => setMsg({ ok: false, text: `Apply failed: ${String(e)}` }))
  }

  function updateKnob(key: keyof DepthTuning, value: number) {
    if (!tuning || !selectedId) return
    const next = { ...tuning, [key]: value }
    setTuning(next)
    pendingRef.current = { ...pendingRef.current, [key]: value }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => flushPending(selectedId), 300)
  }

  function saveWorker() {
    storage.saveWorker(workerHost.trim(), workerPort.trim())
    // Trigger re-fetch by toggling state identity via the effect deps.
    setWorkerHost(workerHost.trim())
    setWorkerPort(workerPort.trim())
    setMsg({ ok: true, text: 'Worker address saved.' })
  }

  function toggleDepth() {
    if (!selectedId) return
    workerApi
      .toggleDepth(selectedId)
      .then((r) => {
        setDepthShow(r.depth_show)
        setMsg({ ok: true, text: r.depth_show ? 'Depth overlay on.' : 'Depth overlay off.' })
      })
      .catch((e) => setMsg({ ok: false, text: `Toggle failed: ${String(e)}` }))
  }

  const feedSrc = selectedId ? workerApi.feedUrl(selectedId) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ name: 'home' })} className="text-gray-500 hover:text-gray-800">←</button>
        <h1 className="text-lg font-bold">Depth Tuning</h1>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Worker address */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-base mb-3">Worker (debug server)</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Host</label>
              <input className="field" value={workerHost} onChange={(e) => setWorkerHost(e.target.value)} />
            </div>
            <div className="w-28">
              <label className="text-sm font-medium block mb-1">Port</label>
              <input className="field" type="number" min={1} max={65535} value={workerPort} onChange={(e) => setWorkerPort(e.target.value)} />
            </div>
            <button onClick={saveWorker} className="border rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 whitespace-nowrap">Save</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Live values are ephemeral — they reset to env-var defaults when the worker restarts.</p>
        </section>

        {/* Scene + feed + knobs */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-base mb-3">Live tuning</h2>
          <div className="mb-4">
            <label className="text-sm font-medium block mb-1">Scene</label>
            <select className="field" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="" disabled>Select a scene</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.name || `${s.cameraHost}:${s.cameraPort}`}</option>
              ))}
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Feed */}
            <div>
              <p className="text-sm font-medium mb-2">Live depth feed</p>
              <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
                {feedSrc ? (
                  <img key={feedSrc} src={feedSrc} alt="depth feed" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-500 text-sm">Select a scene</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">Toggle the depth overlay if the feed shows annotations only.</p>
                <button
                  onClick={toggleDepth}
                  disabled={!selectedId}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  {depthShow === null ? 'Toggle depth overlay' : depthShow ? 'Hide depth overlay' : 'Show depth overlay'}
                </button>
              </div>
            </div>

            {/* Knobs */}
            <div className="space-y-4">
              {loadingTuning && <p className="text-sm text-gray-400">Loading current values…</p>}
              {!loadingTuning && tuning && KNOBS.map((knob) => (
                <div key={knob.key}>
                  <div className="flex justify-between items-baseline">
                    <label className="text-sm font-medium">{knob.label}</label>
                    <span className="text-sm font-mono text-gray-700">{tuning[knob.key]}</span>
                  </div>
                  <input
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    value={tuning[knob.key]}
                    onChange={(e) => updateKnob(knob.key, parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">{knob.hint}</p>
                </div>
              ))}
              {!loadingTuning && !tuning && selectedId && (
                <p className="text-sm text-gray-400">No tuning loaded.</p>
              )}
            </div>
          </div>

          {msg && (
            <p className={`mt-4 text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {msg.ok ? '✓' : '✗'} {msg.text}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
