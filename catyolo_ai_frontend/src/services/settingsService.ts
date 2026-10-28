import { api } from '../api'

// Global backend settings (settings table). `vlm_enabled` is the master
// switch for all VLM capabilities on the Hailo-10H worker; flipping it
// makes the worker restart itself so the VLM is fully loaded/evicted.

export const settingsService = {
  async getVlmEnabled(): Promise<boolean> {
    const res = await api.get<{ vlm_enabled: boolean }>('/settings/vlm')
    return res.vlm_enabled
  },

  async setVlmEnabled(enabled: boolean): Promise<boolean> {
    const res = await api.post<{ vlm_enabled: boolean }>('/settings/vlm', {
      vlm_enabled: enabled,
    })
    return res.vlm_enabled
  },
}
