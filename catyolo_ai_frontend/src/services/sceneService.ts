import { api } from '../api'
import type { Scene, NormZone, Point, EntityClass } from '../types'

async function getImageDimensions(base64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = `data:image/jpeg;base64,${base64}`
  })
}

function parseZone(z: any, imgW: number, imgH: number): NormZone {
  let points: Point[]
  if (Array.isArray(z.points) && z.points.length >= 3) {
    points = z.points.map((p: any) => {
      const px = Array.isArray(p) ? p[0] : p.x
      const py = Array.isArray(p) ? p[1] : p.y
      return { x: px / imgW, y: py / imgH }
    })
  } else if (typeof z.width === 'number' && typeof z.height === 'number') {
    // Legacy rectangle -> 4-point polygon
    const x1 = (z.x ?? 0) / imgW
    const y1 = (z.y ?? 0) / imgH
    const x2 = ((z.x ?? 0) + z.width) / imgW
    const y2 = ((z.y ?? 0) + z.height) / imgH
    points = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ]
  } else {
    points = []
  }

  return {
    points,
    classes: (z.forbidden_classes ?? []) as EntityClass[],
    prompt: z.vlm_prompt ?? undefined,
    vlmDecidesTrigger: z.vlm_decides_trigger ?? undefined,
    depthEnabled: z.depth_enabled ?? undefined,
    depthMargin: z.depth_margin ?? undefined,
    actionIds: z.action_ids ?? undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fromApiResponse(json: any): Promise<Scene> {
  const imageBase64: string | undefined = json['image']?.['image']
  const rawZones: any[] = json['red_zones'] ?? []

  let imgW = 0
  let imgH = 0
  if (imageBase64) {
    try {
      const dims = await getImageDimensions(imageBase64)
      imgW = dims.w
      imgH = dims.h
    } catch {
      // image decode failed — keep dimensions at 0
    }
  }

  const zones: NormZone[] =
    imgW > 0 && imgH > 0
      ? rawZones.map((z: any) => parseZone(z, imgW, imgH))
      : []

  return {
    id: json['scene_id'] ?? '',
    name: json['scene_name'] ?? '',
    cameraHost: json['camera_ip_address'] ?? '',
    cameraPort: json['camera_port']?.toString() ?? '',
    cameraUsername: json['camera_username'] ?? undefined,
    cameraPassword: json['camera_password'] ?? undefined,
    zones,
    scenePrompt: json['scene_prompt'] ?? undefined,
    scenePromptInterval: json['scene_prompt_interval'] ?? undefined,
    scenePromptActionIds: json['scene_prompt_action_ids'] ?? undefined,
    globalDetectionEnabled: json['global_detection_enabled'] ?? undefined,
    globalDetectionClasses: (json['global_detection_classes'] ?? []) as EntityClass[],
    globalDetectionActionIds: json['global_detection_action_ids'] ?? undefined,
    globalDetectionCooldownSeconds: json['global_detection_cooldown_seconds'] ?? undefined,
    debugDepth: json['debug_depth'] ?? undefined,
    imageBase64,
    imageWidth: imgW > 0 ? imgW : undefined,
    imageHeight: imgH > 0 ? imgH : undefined,
  }
}

async function toApiRequest(scene: Scene): Promise<Record<string, unknown>> {
  const b64 = scene.imageBase64 ?? ''
  let w = 0
  let h = 0
  if (b64) {
    try {
      const dims = await getImageDimensions(b64)
      w = dims.w
      h = dims.h
    } catch {
      //
    }
  }

  const redZones =
    w > 0 && h > 0
      ? scene.zones.map((zone) => {
          const pixelPoints = zone.points.map((p) => [
            Math.round(p.x * w),
            Math.round(p.y * h),
          ])

          // Keep legacy rectangle fields for downstream consumers that still expect them
          const xs = zone.points.map((p) => p.x)
          const ys = zone.points.map((p) => p.y)
          const nx1 = xs.length ? Math.min(...xs) : 0
          const ny1 = ys.length ? Math.min(...ys) : 0
          const nx2 = xs.length ? Math.max(...xs) : 0
          const ny2 = ys.length ? Math.max(...ys) : 0

          return {
            points: pixelPoints,
            x: Math.round(nx1 * w),
            y: Math.round(ny1 * h),
            width: Math.round((nx2 - nx1) * w),
            height: Math.round((ny2 - ny1) * h),
            forbidden_classes: zone.classes,
            vlm_prompt: zone.prompt?.trim() || null,
            vlm_decides_trigger: zone.vlmDecidesTrigger ?? null,
            depth_enabled: zone.depthEnabled ?? null,
            depth_margin: zone.depthMargin ?? null,
            action_ids: zone.actionIds?.length ? zone.actionIds : null,
          }
        })
      : []

  return {
    scene_name: scene.name,
    camera_ip_address: scene.cameraHost,
    camera_port: parseInt(scene.cameraPort, 10),
    camera_username: scene.cameraUsername || null,
    camera_password: scene.cameraPassword || null,
    image: { image: b64 },
    red_zones: redZones,
    scene_prompt: scene.scenePrompt?.trim() || null,
    scene_prompt_interval: scene.scenePromptInterval ?? null,
    scene_prompt_action_ids: scene.scenePromptActionIds?.length ? scene.scenePromptActionIds : null,
    global_detection_enabled: scene.globalDetectionEnabled ?? false,
    global_detection_classes: scene.globalDetectionClasses?.length ? scene.globalDetectionClasses : null,
    global_detection_action_ids: scene.globalDetectionActionIds?.length ? scene.globalDetectionActionIds : null,
    global_detection_cooldown_seconds: scene.globalDetectionCooldownSeconds ?? null,
    debug_depth: scene.debugDepth ?? false,
  }
}

export const sceneService = {
  async loadAll(): Promise<Scene[]> {
    const data = await api.get<any[]>('/scene/')
    return Promise.all(data.map(fromApiResponse))
  },

  async upsert(scene: Scene): Promise<Scene> {
    const body = await toApiRequest(scene)
    if (!scene.id) {
      const result = await api.post<any>('/scene/create', body)
      return fromApiResponse(result)
    } else {
      const result = await api.patch<any>(`/scene/update/${scene.id}`, body)
      return fromApiResponse(result)
    }
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/scene/delete/${id}`)
  },

  async analyze(id: string): Promise<string> {
    const result = await api.get<{ message: string }>(`/scene/analyze/${id}`)
    return result.message
  },
}
