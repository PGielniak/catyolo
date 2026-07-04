import { useRef, useEffect, useState, useCallback } from 'react'
import type { NormZone, Point, EntityClass, CatyoloAction } from '../types'

const ENTITY_LABELS: Record<EntityClass, string> = {
  person: 'Person',
  cat: 'Cat',
}
const ALL_CLASSES: EntityClass[] = ['person', 'cat']

function pointInPolygon(p: Point, poly: Point[]): boolean {
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      (yi > p.y) !== (yj > p.y) &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function projectOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { t: number; point: Point; distSq: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) return { t: 0, point: a, distSq: distSq(p, a) }
  let t = (apx * abx + apy * aby) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + t * abx, y: a.y + t * aby }
  return { t, point, distSq: distSq(p, point) }
}

function polygonCentroid(poly: Point[]): Point {
  let cx = 0
  let cy = 0
  for (const p of poly) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / poly.length, y: cy / poly.length }
}

interface ClassPickerProps {
  initial: EntityClass[]
  initialPrompt: string
  initialVlmDecidesTrigger: boolean
  initialDepthEnabled: boolean
  initialDepthMargin: number
  initialActionIds: string[]
  availableActions: CatyoloAction[]
  isNew: boolean
  onConfirm: (
    classes: EntityClass[],
    prompt: string,
    vlmDecidesTrigger: boolean,
    depthEnabled: boolean,
    depthMargin: number,
    actionIds: string[],
  ) => void
  onCancel: () => void
}

function ClassPicker({
  initial,
  initialPrompt,
  initialVlmDecidesTrigger,
  initialDepthEnabled,
  initialDepthMargin,
  initialActionIds,
  availableActions,
  isNew,
  onConfirm,
  onCancel,
}: ClassPickerProps) {
  const [selected, setSelected] = useState<Set<EntityClass>>(new Set(initial))
  const [prompt, setPrompt] = useState(initialPrompt)
  const [vlmDecidesTrigger, setVlmDecidesTrigger] = useState(initialVlmDecidesTrigger)
  const [depthEnabled, setDepthEnabled] = useState(initialDepthEnabled)
  const [depthMargin, setDepthMargin] = useState(initialDepthMargin)
  const [actionSel, setActionSel] = useState<Set<string>>(new Set(initialActionIds))

  function toggle(c: EntityClass) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }

  function toggleAction(id: string) {
    setActionSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-xs w-full p-6">
        <h2 className="font-bold text-base mb-1">
          {isNew ? 'New Zone' : 'Edit Zone'} — Restricted Entities
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Select which entities are NOT allowed in this zone:
        </p>
        <div className="space-y-2 mb-5">
          {ALL_CLASSES.map((c) => (
            <label key={c} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(c)}
                onChange={() => toggle(c)}
                className="w-4 h-4 accent-blue-600"
              />
              <span>{ENTITY_LABELS[c]}</span>
            </label>
          ))}
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium block mb-1">VLM Prompt</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="Is the {class} attacking a plant? Answer with Yes or No only"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-gray-500 mt-1">
            Asked when a restricted entity enters this zone. Use {'{class}'} as placeholder for the detected entity.
          </p>
          <label className="flex items-center gap-3 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={vlmDecidesTrigger}
              onChange={(e) => setVlmDecidesTrigger(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm">Only trigger when VLM answers Yes</span>
          </label>
          <p className="text-xs text-gray-500 mt-1">
            When unchecked, the action runs regardless of the VLM answer; the prompt and answer are still included in metadata.
          </p>
        </div>

        <div className="mb-5">
          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={depthEnabled}
              onChange={(e) => setDepthEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-medium">Depth Gating</span>
          </label>
          {depthEnabled && (
            <div>
              <label className="text-sm font-medium block mb-1">Depth Margin</label>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.01"
                value={depthMargin}
                onChange={(e) => setDepthMargin(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>Strict (0.05)</span>
                <span>{depthMargin.toFixed(2)}</span>
                <span>Loose (0.50)</span>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            When enabled, VLM only fires if the detected object&apos;s depth matches the zone&apos;s reference depth.
          </p>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium block mb-1">Actions</label>
          {availableActions.length === 0 ? (
            <p className="text-xs text-gray-400">No actions defined. Add some in Settings.</p>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {availableActions.map((a) => (
                <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actionSel.has(a.id)}
                    onChange={() => toggleAction(a.id)}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  <span className="text-xs">{a.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm(
                Array.from(selected),
                prompt,
                vlmDecidesTrigger,
                depthEnabled,
                depthMargin,
                Array.from(actionSel),
              )
            }
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Pending {
  type: 'new' | 'edit'
  index?: number
  points?: Point[]
  initial: EntityClass[]
  initialPrompt: string
  initialVlmDecidesTrigger: boolean
  initialDepthEnabled: boolean
  initialDepthMargin: number
  initialActionIds: string[]
}

interface Props {
  imageBase64: string
  imageWidth: number
  imageHeight: number
  zones: NormZone[]
  onChange: (zones: NormZone[]) => void
  availableActions: CatyoloAction[]
}

function computeImageRect(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number,
) {
  if (imgW === 0 || imgH === 0 || canvasW === 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const scale = canvasW / imgW
  const rw = canvasW
  const rh = imgH * scale
  return {
    left: 0,
    top: (canvasH - rh) / 2,
    width: rw,
    height: rh,
  }
}

export default function ZoneCanvas({
  imageBase64,
  imageWidth,
  imageHeight,
  zones,
  onChange,
  availableActions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [draft, setDraft] = useState<Point[] | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const [selectedVertex, setSelectedVertex] = useState<{
    zoneIndex: number
    pointIndex: number
  } | null>(null)
  const [dragVertex, setDragVertex] = useState<{
    zoneIndex: number
    pointIndex: number
  } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [redoStack, setRedoStack] = useState<NormZone[][]>([])

  // Observe container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (entries?: ResizeObserverEntry[]) => {
      const e = entries ? entries[0] : undefined
      setCanvasSize({
        w: e ? e.contentRect.width : el.clientWidth,
        h: e ? e.contentRect.height : el.clientHeight,
      })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function toNorm(clientX: number, clientY: number): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const ir = computeImageRect(canvasSize.w, canvasSize.h, imageWidth, imageHeight)
    if (ir.width <= 0 || ir.height <= 0) {
      return { x: 0, y: 0 }
    }
    return {
      x: Math.max(0, Math.min(1, (x - ir.left) / ir.width)),
      y: Math.max(0, Math.min(1, (y - ir.top) / ir.height)),
    }
  }

  function hitThreshold(): number {
    const ir = computeImageRect(canvasSize.w, canvasSize.h, imageWidth, imageHeight)
    const minDim = Math.min(ir.width, ir.height)
    return minDim > 0 ? 8 / minDim : 0.02
  }

  function findVertexAt(p: Point): { zoneIndex: number; pointIndex: number } | null {
    const threshold = hitThreshold()
    const thresholdSq = threshold * threshold
    for (let zi = zones.length - 1; zi >= 0; zi--) {
      const zone = zones[zi]
      for (let pi = 0; pi < zone.points.length; pi++) {
        if (distSq(p, zone.points[pi]) <= thresholdSq) {
          return { zoneIndex: zi, pointIndex: pi }
        }
      }
    }
    return null
  }

  function findEdgeAt(
    p: Point,
  ): { zoneIndex: number; segmentIndex: number; point: Point } | null {
    const threshold = hitThreshold()
    const thresholdSq = threshold * threshold
    for (let zi = zones.length - 1; zi >= 0; zi--) {
      const zone = zones[zi]
      if (zone.points.length < 2) continue
      for (let si = 0; si < zone.points.length; si++) {
        const a = zone.points[si]
        const b = zone.points[(si + 1) % zone.points.length]
        const proj = projectOnSegment(p, a, b)
        if (proj.distSq <= thresholdSq) {
          return { zoneIndex: zi, segmentIndex: si, point: proj.point }
        }
      }
    }
    return null
  }

  function findZoneAt(p: Point): number {
    for (let zi = zones.length - 1; zi >= 0; zi--) {
      if (pointInPolygon(p, zones[zi].points)) return zi
    }
    return -1
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      const p = toNorm(e.clientX, e.clientY)
      setHover(p)
      setRedoStack([])

      if (draft) {
        setDraft([...draft, p])
        return
      }

      const vertex = findVertexAt(p)
      if (vertex) {
        setSelectedVertex(vertex)
        setDragVertex(vertex)
        return
      }

      const edge = findEdgeAt(p)
      if (edge) {
        const updated = [...zones]
        const zone = { ...updated[edge.zoneIndex] }
        const pts = [...zone.points]
        pts.splice(edge.segmentIndex + 1, 0, edge.point)
        zone.points = pts
        updated[edge.zoneIndex] = zone
        onChange(updated)
        const newVertex = { zoneIndex: edge.zoneIndex, pointIndex: edge.segmentIndex + 1 }
        setSelectedVertex(newVertex)
        setDragVertex(newVertex)
        return
      }

      const zoneIdx = findZoneAt(p)
      if (zoneIdx >= 0) {
        setPending({
          type: 'edit',
          index: zoneIdx,
          initial: [...zones[zoneIdx].classes],
          initialPrompt: zones[zoneIdx].prompt ?? '',
          initialVlmDecidesTrigger: zones[zoneIdx].vlmDecidesTrigger ?? false,
          initialDepthEnabled: zones[zoneIdx].depthEnabled ?? false,
          initialDepthMargin: zones[zoneIdx].depthMargin ?? 0.2,
          initialActionIds: zones[zoneIdx].actionIds ?? [],
        })
        return
      }

      // Start new draft
      setDraft([p])
      setSelectedVertex(null)
    },
    [draft, zones, canvasSize, imageWidth, imageHeight],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const p = toNorm(e.clientX, e.clientY)
      setHover(p)
      if (dragVertex) {
        const updated = [...zones]
        const zone = { ...updated[dragVertex.zoneIndex] }
        const pts = [...zone.points]
        pts[dragVertex.pointIndex] = {
          x: Math.max(0, Math.min(1, p.x)),
          y: Math.max(0, Math.min(1, p.y)),
        }
        zone.points = pts
        updated[dragVertex.zoneIndex] = zone
        onChange(updated)
      }
    },
    [dragVertex, zones, canvasSize, imageWidth, imageHeight],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (canvas) {
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      setDragVertex(null)
    },
    [],
  )

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const p = toNorm(e.clientX, e.clientY)
      const vertex = findVertexAt(p)
      if (!vertex) return
      const zone = zones[vertex.zoneIndex]
      if (zone.points.length <= 3) {
        // Delete the whole zone if we cannot keep a valid polygon
        const updated = zones.filter((_, i) => i !== vertex.zoneIndex)
        onChange(updated)
      } else {
        const updated = [...zones]
        const newZone = { ...updated[vertex.zoneIndex] }
        newZone.points = newZone.points.filter((_, i) => i !== vertex.pointIndex)
        updated[vertex.zoneIndex] = newZone
        onChange(updated)
      }
      setSelectedVertex(null)
    },
    [zones, canvasSize, imageWidth, imageHeight],
  )

  function finishDraft() {
    if (!draft || draft.length < 3) return
    setPending({
      type: 'new',
      points: draft,
      initial: [],
      initialPrompt: '',
      initialVlmDecidesTrigger: false,
      initialDepthEnabled: false,
      initialDepthMargin: 0.2,
      initialActionIds: [],
    })
    setDraft(null)
  }

  function cancelDraft() {
    setDraft(null)
    setSelectedVertex(null)
  }

  function deleteSelectedVertex() {
    if (!selectedVertex) return
    const zone = zones[selectedVertex.zoneIndex]
    if (zone.points.length <= 3) {
      const updated = zones.filter((_, i) => i !== selectedVertex.zoneIndex)
      onChange(updated)
    } else {
      const updated = [...zones]
      const newZone = { ...updated[selectedVertex.zoneIndex] }
      newZone.points = newZone.points.filter((_, i) => i !== selectedVertex.pointIndex)
      updated[selectedVertex.zoneIndex] = newZone
      onChange(updated)
    }
    setSelectedVertex(null)
  }

  function handleClassConfirm(
    classes: EntityClass[],
    prompt: string,
    vlmDecidesTrigger: boolean,
    depthEnabled: boolean,
    depthMargin: number,
    actionIds: string[],
  ) {
    if (!pending) return
    const trimmedPrompt = prompt.trim() || undefined
    const vlmTrigger = trimmedPrompt ? vlmDecidesTrigger : undefined
    const dz = depthEnabled ? { depthEnabled, depthMargin } : {}
    const actIds = actionIds.length ? { actionIds } : {}
    if (pending.type === 'new' && pending.points) {
      const newZone: NormZone = {
        points: pending.points,
        classes,
        prompt: trimmedPrompt,
        vlmDecidesTrigger: vlmTrigger,
        ...dz,
        ...actIds,
      }
      onChange([...zones, newZone])
      setRedoStack([])
    } else if (pending.type === 'edit' && pending.index !== undefined) {
      const updated = [...zones]
      updated[pending.index] = {
        ...updated[pending.index],
        classes,
        prompt: trimmedPrompt,
        vlmDecidesTrigger: vlmTrigger,
        ...dz,
        ...actIds,
      }
      onChange(updated)
    }
    setPending(null)
  }

  function undo() {
    if (draft) {
      if (draft.length <= 1) {
        setDraft(null)
      } else {
        setDraft(draft.slice(0, -1))
      }
      return
    }
    if (zones.length === 0) return
    setRedoStack((s) => [...s, zones])
    onChange(zones.slice(0, -1))
  }

  function redo() {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    setRedoStack((s) => s.slice(0, -1))
    onChange(last)
  }

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || canvasSize.w === 0) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)

    const ir = computeImageRect(canvasSize.w, canvasSize.h, imageWidth, imageHeight)

    function toScreen(p: Point): { x: number; y: number } {
      return { x: ir.left + p.x * ir.width, y: ir.top + p.y * ir.height }
    }

    function drawPolygon(poly: Point[], label?: string, isSelected?: boolean) {
      if (poly.length < 3) return
      ctx.beginPath()
      const start = toScreen(poly[0])
      ctx.moveTo(start.x, start.y)
      for (let i = 1; i < poly.length; i++) {
        const pt = toScreen(poly[i])
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.closePath()
      ctx.fillStyle = isSelected ? 'rgba(220,38,38,0.22)' : 'rgba(220,38,38,0.14)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(220,38,38,0.9)'
      ctx.lineWidth = 2
      ctx.stroke()

      if (label) {
        const c = polygonCentroid(poly)
        const sc = toScreen(c)
        ctx.font = 'bold 11px sans-serif'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.beginPath()
        ctx.roundRect(sc.x - tw / 2 - 4, sc.y - 9, tw + 8, 18, 3)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(label, sc.x - tw / 2, sc.y + 4)
      }
    }

    function drawVertex(p: Point, isSelected?: boolean) {
      const s = toScreen(p)
      ctx.beginPath()
      ctx.arc(s.x, s.y, isSelected ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#fff' : 'rgba(220,38,38,0.9)'
      ctx.fill()
      ctx.strokeStyle = isSelected ? 'rgba(220,38,38,0.9)' : '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    for (let i = 0; i < zones.length; i++) {
      const label = zones[i].classes.map((c) => ENTITY_LABELS[c]).join(' · ')
      drawPolygon(zones[i].points, label || undefined, selectedVertex?.zoneIndex === i)
      for (let j = 0; j < zones[i].points.length; j++) {
        const isSel =
          selectedVertex?.zoneIndex === i && selectedVertex?.pointIndex === j
        drawVertex(zones[i].points[j], isSel)
      }
    }

    if (draft && draft.length > 0) {
      ctx.beginPath()
      const start = toScreen(draft[0])
      ctx.moveTo(start.x, start.y)
      for (let i = 1; i < draft.length; i++) {
        const pt = toScreen(draft[i])
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.strokeStyle = 'rgba(220,38,38,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])

      if (hover) {
        const last = toScreen(draft[draft.length - 1])
        const h = toScreen(hover)
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(h.x, h.y)
        ctx.strokeStyle = 'rgba(220,38,38,0.6)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      for (const p of draft) drawVertex(p)
    }
  }, [canvasSize, zones, draft, hover, selectedVertex, imageWidth, imageHeight])

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap gap-2 px-2 pb-1 items-center">
        <button
          onClick={undo}
          disabled={!draft && zones.length === 0}
          className="text-sm px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
        >
          ↩ Undo
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="text-sm px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
        >
          ↪ Redo
        </button>
        {draft ? (
          <>
            <button
              onClick={finishDraft}
              disabled={draft.length < 3}
              className="text-sm px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700"
            >
              Done
            </button>
            <button
              onClick={cancelDraft}
              className="text-sm px-2 py-1 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <span className="text-xs text-gray-400">
              Click to add points · {draft.length} point{draft.length === 1 ? '' : 's'} · Done to finish
            </span>
          </>
        ) : (
          <>
            {selectedVertex && (
              <button
                onClick={deleteSelectedVertex}
                className="text-sm px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
              >
                Delete point
              </button>
            )}
            <span className="text-xs text-gray-400">
              Click empty to draw · drag points · click edge to add point · right-click point to delete · tap zone to edit
            </span>
          </>
        )}
      </div>

      <div ref={containerRef} className="relative w-full rounded-lg bg-black">
        <img
          src={`data:image/jpeg;base64,${imageBase64}`}
          alt="Camera frame"
          className="w-full h-auto object-contain select-none"
          style={{
            aspectRatio:
              imageWidth && imageHeight ? `${imageWidth} / ${imageHeight}` : undefined,
          }}
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="absolute inset-0 cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={onContextMenu}
          style={{ touchAction: 'none' }}
        />
      </div>

      {pending && (
        <ClassPicker
          initial={pending.initial}
          initialPrompt={pending.initialPrompt}
          initialVlmDecidesTrigger={pending.initialVlmDecidesTrigger}
          initialDepthEnabled={pending.initialDepthEnabled}
          initialDepthMargin={pending.initialDepthMargin}
          initialActionIds={pending.initialActionIds}
          availableActions={availableActions}
          isNew={pending.type === 'new'}
          onConfirm={handleClassConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
