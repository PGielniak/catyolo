import { useEffect, useState } from 'react'
import type { Scene, NormZone, CatyoloAction, Page, EntityClass } from '../types'
import { api } from '../api'
import { sceneService } from '../services/sceneService'
import { actionService } from '../services/actionService'
import ZoneCanvas from '../components/ZoneCanvas'

interface Props {
  scene?: Scene
  navigate: (p: Page) => void
}

export default function SceneConfigPage({ scene: initialScene, navigate }: Props) {
  const [name, setName] = useState(initialScene?.name ?? '')
  const [cameraHost, setCameraHost] = useState(initialScene?.cameraHost ?? '')
  const [cameraPort, setCameraPort] = useState(initialScene?.cameraPort ?? '')
  const [cameraUsername, setCameraUsername] = useState(initialScene?.cameraUsername ?? '')
  const [cameraPassword, setCameraPassword] = useState(initialScene?.cameraPassword ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [zones, setZones] = useState<NormZone[]>(initialScene?.zones ?? initialScene?.rects ?? [])
  // scenePrompt is fixed — not user-editable; always sent as the global description prompt
  const [scenePromptInterval, setScenePromptInterval] = useState<string>(
    initialScene?.scenePromptInterval ? Math.round(initialScene.scenePromptInterval / 60).toString() : ''
  )
  const [scenePromptActionIds, setScenePromptActionIds] = useState<string[]>(
    initialScene?.scenePromptActionIds ?? []
  )
  const [showPromptActionPicker, setShowPromptActionPicker] = useState(false)
  const [globalDetectionEnabled, setGlobalDetectionEnabled] = useState<boolean>(
    initialScene?.globalDetectionEnabled ?? false
  )
  const [globalDetectionClasses, setGlobalDetectionClasses] = useState<Set<EntityClass>>(
    new Set(initialScene?.globalDetectionClasses ?? [])
  )
  const [globalDetectionActionIds, setGlobalDetectionActionIds] = useState<string[]>(
    initialScene?.globalDetectionActionIds ?? []
  )
  const [globalDetectionCooldownSeconds, setGlobalDetectionCooldownSeconds] = useState<string>(
    initialScene?.globalDetectionCooldownSeconds?.toString() ?? '60'
  )
  const [showGlobalActionPicker, setShowGlobalActionPicker] = useState(false)
  const [imageBase64, setImageBase64] = useState<string | undefined>(initialScene?.imageBase64)
  const [imageWidth, setImageWidth] = useState<number>(initialScene?.imageWidth ?? 0)
  const [imageHeight, setImageHeight] = useState<number>(initialScene?.imageHeight ?? 0)
  const [loadingImage, setLoadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [availableActions, setAvailableActions] = useState<CatyoloAction[]>([])

  useEffect(() => {
    actionService.loadAll().then((actions) => {
      setAvailableActions(actions)
      setScenePromptActionIds((ids) => ids.filter((id) => actions.some((a) => a.id === id)))
      setGlobalDetectionActionIds((ids) => ids.filter((id) => actions.some((a) => a.id === id)))
    })
  }, [])

  async function getImage() {
    setLoadingImage(true)
    setImageError(null)
    try {
      const result = await api.get<{ image: string }>('/frame/', {
        camera_ip: cameraHost.trim(),
        camera_port: cameraPort.trim(),
        ...(initialScene?.id ? { scene_id: initialScene.id } : {}),
        ...(cameraUsername.trim() && { camera_username: cameraUsername.trim() }),
        ...(cameraPassword.trim() && { camera_password: cameraPassword.trim() }),
      })
      const b64 = result.image
      // Show the image immediately; resolve dimensions in parallel
      setImageBase64(b64)
      try {
        const dims = await getImageDimensions(b64)
        setImageWidth(dims.w)
        setImageHeight(dims.h)
      } catch {
        // Fall back to defaults so zone drawing still works
        setImageWidth(1920)
        setImageHeight(1080)
      }
    } catch (err) {
      setImageError(`Could not get frame: ${err instanceof Error ? err.message : String(err)}`)
      console.error(err)
    } finally {
      setLoadingImage(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaving(true)
    try {
      await sceneService.upsert({
        id: initialScene?.id ?? '',
        name: name.trim(),
        cameraHost: cameraHost.trim(),
        cameraPort: cameraPort.trim(),
        cameraUsername: cameraUsername.trim() || undefined,
        cameraPassword: cameraPassword.trim() || undefined,
        zones,
        rects: zones,
        scenePrompt: 'Describe what you see in this image in one sentence.',
        scenePromptInterval: scenePromptInterval ? parseInt(scenePromptInterval, 10) * 60 : undefined,
        scenePromptActionIds,
        globalDetectionEnabled,
        globalDetectionClasses: Array.from(globalDetectionClasses),
        globalDetectionActionIds,
        globalDetectionCooldownSeconds: globalDetectionCooldownSeconds
          ? parseInt(globalDetectionCooldownSeconds, 10)
          : undefined,
        imageBase64,
        imageWidth: imageWidth || undefined,
        imageHeight: imageHeight || undefined,
      })
      navigate({ name: 'home' })
    } catch (err) {
      setSaveError(`Save failed: ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const canGetImage = cameraHost.trim() && cameraPort.trim()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate({ name: 'home' })}
          className="text-gray-500 hover:text-gray-800"
        >
          ←
        </button>
        <h1 className="text-lg font-bold flex-1">
          {initialScene ? 'Edit Scene' : 'New Scene'}
        </h1>
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <form onSubmit={save} className="flex flex-col flex-1 overflow-y-auto">
        {/* Config panel */}
        <div className="p-4 space-y-3 bg-white border-b">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Scene Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Camera IP Address"
              value={cameraHost}
              onChange={(e) => setCameraHost(e.target.value)}
              required
            />
            <input
              className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Port"
              type="number"
              min={1}
              max={65535}
              value={cameraPort}
              onChange={(e) => setCameraPort(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Username (optional)"
              value={cameraUsername}
              onChange={(e) => setCameraUsername(e.target.value)}
              autoComplete="username"
            />
            <div className="flex-1 relative">
              <input
                className="w-full border rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Password (optional)"
                type={showPassword ? 'text' : 'password'}
                value={cameraPassword}
                onChange={(e) => setCameraPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={getImage}
            disabled={loadingImage || !canGetImage}
            className="w-full border rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingImage ? 'Loading image…' : '📷 Get Image'}
          </button>

          {imageError && (
            <p className="text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded p-2">{imageError}</p>
          )}
          {imageBase64 && (
            <p className="text-green-600 text-xs">Image data received ({Math.round(imageBase64.length / 1024)} KB)</p>
          )}

          {/* Global Prompt */}
          <div className="border-t pt-3">
            <span className="text-sm font-medium">Global Prompt</span>
            <p className="text-xs text-gray-400 mb-2">
              Runs on a timer against the full camera frame. Triggers assigned actions when the answer is "Yes".
            </p>
            <div className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 mb-2 cursor-not-allowed">
              Describe what you see in this image in one sentence.
            </div>
            <p className="text-xs text-gray-400 mb-2">
              The prompt is fixed — the VLM describes the scene and the description is emitted as an event for attached actions.
            </p>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Interval (minutes)</label>
              <input
                className="w-20 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="number"
                min={1}
                placeholder="10"
                value={scenePromptInterval}
                onChange={(e) => setScenePromptInterval(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Prompt Actions</span>
                <button
                  type="button"
                  onClick={() => setShowPromptActionPicker(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Attach
                </button>
              </div>
              {scenePromptActionIds.length === 0 ? (
                <p className="text-xs text-gray-400">No actions attached.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {scenePromptActionIds.map((id) => {
                    const a = availableActions.find((x) => x.id === id)
                    if (!a) return null
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 text-xs px-2 py-0.5 rounded-full"
                      >
                        {a.name}
                        <button
                          type="button"
                          onClick={() => setScenePromptActionIds((ids) => ids.filter((x) => x !== id))}
                          className="text-purple-400 hover:text-purple-700"
                        >
                          x
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Global Object Detection Trigger */}
          <div className="border-t pt-3">
            <span className="text-sm font-medium">Global Object Detection Trigger</span>
            <p className="text-xs text-gray-400 mb-2">
              Run actions when selected objects appear anywhere in the frame.
            </p>
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={globalDetectionEnabled}
                onChange={(e) => setGlobalDetectionEnabled(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm">Enable global detection trigger</span>
            </label>
            {globalDetectionEnabled && (
              <div className="space-y-3 pl-1">
                <div>
                  <span className="text-xs font-medium block mb-1">Trigger classes</span>
                  <div className="flex gap-4">
                    {(['person', 'cat'] as EntityClass[]).map((c) => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={globalDetectionClasses.has(c)}
                          onChange={() => {
                            setGlobalDetectionClasses((prev) => {
                              const next = new Set(prev)
                              next.has(c) ? next.delete(c) : next.add(c)
                              return next
                            })
                          }}
                          className="w-4 h-4 accent-blue-600"
                        />
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Cooldown (seconds)</label>
                  <input
                    className="w-20 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="number"
                    min={1}
                    placeholder="60"
                    value={globalDetectionCooldownSeconds}
                    onChange={(e) => setGlobalDetectionCooldownSeconds(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">Actions</span>
                    <button
                      type="button"
                      onClick={() => setShowGlobalActionPicker(true)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + Attach
                    </button>
                  </div>
                  {globalDetectionActionIds.length === 0 ? (
                    <p className="text-xs text-gray-400">No actions attached.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {globalDetectionActionIds.map((id) => {
                        const a = availableActions.find((x) => x.id === id)
                        if (!a) return null
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs px-2 py-0.5 rounded-full"
                          >
                            {a.name}
                            <button
                              type="button"
                              onClick={() => setGlobalDetectionActionIds((ids) => ids.filter((x) => x !== id))}
                              className="text-blue-400 hover:text-blue-700"
                            >
                              x
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {saveError && <p className="text-red-600 text-xs">{saveError}</p>}
        </div>

        {/* Canvas area */}
        <div className="p-2 flex flex-col">
          {imageBase64 ? (
            <ZoneCanvas
              imageBase64={imageBase64}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              zones={zones}
              onChange={setZones}
              availableActions={availableActions}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-center">
              <div>
                <div className="text-4xl mb-3">👆</div>
                <p className="text-sm">Fill in camera details and tap "Get Image" to load a frame.</p>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Prompt action picker modal */}
      {showPromptActionPicker && (
        <ActionPickerModal
          available={availableActions}
          selected={scenePromptActionIds}
          onConfirm={(ids) => { setScenePromptActionIds(ids); setShowPromptActionPicker(false) }}
          onCancel={() => setShowPromptActionPicker(false)}
        />
      )}

      {/* Global detection action picker modal */}
      {showGlobalActionPicker && (
        <ActionPickerModal
          available={availableActions}
          selected={globalDetectionActionIds}
          onConfirm={(ids) => { setGlobalDetectionActionIds(ids); setShowGlobalActionPicker(false) }}
          onCancel={() => setShowGlobalActionPicker(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface ActionPickerProps {
  available: CatyoloAction[]
  selected: string[]
  onConfirm: (ids: string[]) => void
  onCancel: () => void
}

function ActionPickerModal({ available, selected: initial, onConfirm, onCancel }: ActionPickerProps) {
  const [sel, setSel] = useState(new Set(initial))

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="font-bold text-lg mb-4">Attach Actions</h2>
        {available.length === 0 ? (
          <p className="text-gray-500 text-sm mb-5">
            No actions defined yet. Add some in Settings → Configure Actions.
          </p>
        ) : (
          <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
            {available.map((a) => (
              <label key={a.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sel.has(a.id)}
                  onChange={() => toggle(a.id)}
                  className="w-4 h-4 accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.type}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(sel))}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getImageDimensions(base64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = `data:image/jpeg;base64,${base64}`
  })
}
