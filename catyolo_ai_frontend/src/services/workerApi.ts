import { storage } from '../storage'

// The worker's debug HTTP server (port 5001) has no auth and is reachable
// directly from the browser. Used for live depth-tuning knobs + the MJPEG feed.

export interface DepthTuning {
  depth_diff_threshold: number
  depth_diff_downsample: number
  depth_smooth_window: number
  depth_guided_radius: number
  depth_guided_eps: number
}

function baseUrl() {
  return `http://${storage.getWorkerHost()}:${storage.getWorkerPort()}`
}

export const workerApi = {
  feedUrl(sceneId: string): string {
    return `${baseUrl()}/feed/${sceneId}`
  },

  async getDepthTuning(sceneId: string): Promise<DepthTuning> {
    const res = await fetch(`${baseUrl()}/depth_tuning/${sceneId}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Worker returned ${res.status}: ${await res.text()}`)
    const json = await res.json()
    return json.tuning as DepthTuning
  },

  async setDepthTuning(sceneId: string, params: Partial<DepthTuning>): Promise<DepthTuning> {
    const res = await fetch(`${baseUrl()}/depth_tuning/${sceneId}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Worker returned ${res.status}: ${await res.text()}`)
    const json = await res.json()
    return json.tuning as DepthTuning
  },

  async toggleDepth(sceneId: string): Promise<{ scene_id: string; depth_show: boolean }> {
    const res = await fetch(`${baseUrl()}/toggle_depth/${sceneId}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Worker returned ${res.status}: ${await res.text()}`)
    return res.json()
  },
}
