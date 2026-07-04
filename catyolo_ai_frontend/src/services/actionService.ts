import { api } from '../api'
import type { CatyoloAction, ActionType, WebhookAuthType, WhatsAppAuthScheme } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromApiResponse(json: any): CatyoloAction {
  const config: any = json['action_config'] ?? {}

  return {
    id: json['action_id'] ?? '',
    name: json['action_name'],
    type: (json['action_type'] ?? 'telegram') as ActionType,
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
    telegramMessageTemplate: config.telegramMessageTemplate,
    webhookUrl: config.webhookUrl,
    webhookAuthType: config.webhookAuthType as WebhookAuthType | undefined,
    webhookUsername: config.webhookUsername,
    webhookPassword: config.webhookPassword,
    webhookApiKey: config.webhookApiKey,
    webhookClientId: config.webhookClientId,
    webhookClientSecret: config.webhookClientSecret,
    webhookTokenEndpoint: config.webhookTokenEndpoint,
    smbHost: config.smbHost,
    smbPort: typeof config.smbPort === 'number' ? config.smbPort : undefined,
    smbShare: config.smbShare,
    smbFolder: config.smbFolder,
    smbUsername: config.smbUsername,
    smbPassword: config.smbPassword,
    smbDomain: config.smbDomain,
    whatsappApiUrl: config.whatsappApiUrl,
    whatsappApiToken: config.whatsappApiToken,
    whatsappAuthScheme: config.whatsappAuthScheme as WhatsAppAuthScheme | undefined,
    whatsappPayloadTemplate: config.whatsappPayloadTemplate,
    whatsappSendImage: typeof config.whatsappSendImage === 'boolean' ? config.whatsappSendImage : undefined,
  }
}

function toApiRequest(action: CatyoloAction): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (action.type === 'telegram') {
    if (action.telegramBotToken) config.telegramBotToken = action.telegramBotToken
    if (action.telegramChatId) config.telegramChatId = action.telegramChatId
    if (action.telegramMessageTemplate) config.telegramMessageTemplate = action.telegramMessageTemplate
  }
  if (action.type === 'webhook') {
    if (action.webhookUrl) config.webhookUrl = action.webhookUrl
    if (action.webhookAuthType) config.webhookAuthType = action.webhookAuthType
    if (action.webhookUsername) config.webhookUsername = action.webhookUsername
    if (action.webhookPassword) config.webhookPassword = action.webhookPassword
    if (action.webhookApiKey) config.webhookApiKey = action.webhookApiKey
    if (action.webhookClientId) config.webhookClientId = action.webhookClientId
    if (action.webhookClientSecret) config.webhookClientSecret = action.webhookClientSecret
    if (action.webhookTokenEndpoint) config.webhookTokenEndpoint = action.webhookTokenEndpoint
  }
  if (action.type === 'smbFileshare') {
    if (action.smbHost) config.smbHost = action.smbHost
    if (action.smbPort) config.smbPort = action.smbPort
    if (action.smbShare) config.smbShare = action.smbShare
    if (action.smbFolder) config.smbFolder = action.smbFolder
    if (action.smbUsername) config.smbUsername = action.smbUsername
    if (action.smbPassword) config.smbPassword = action.smbPassword
    if (action.smbDomain) config.smbDomain = action.smbDomain
  }
  if (action.type === 'whatsapp') {
    if (action.whatsappApiUrl) config.whatsappApiUrl = action.whatsappApiUrl
    if (action.whatsappApiToken) config.whatsappApiToken = action.whatsappApiToken
    if (action.whatsappAuthScheme) config.whatsappAuthScheme = action.whatsappAuthScheme
    if (action.whatsappPayloadTemplate) config.whatsappPayloadTemplate = action.whatsappPayloadTemplate
    if (action.whatsappSendImage === false) config.whatsappSendImage = false
  }

  return {
    action_name: action.name,
    action_type: action.type,
    ...(Object.keys(config).length ? { action_config: config } : {}),
  }
}

export const actionService = {
  async loadAll(): Promise<CatyoloAction[]> {
    const data = await api.get<any[]>('/action/')
    return data.map(fromApiResponse)
  },

  async upsert(action: CatyoloAction): Promise<CatyoloAction> {
    const body = toApiRequest(action)
    if (!action.id) {
      const result = await api.post<any>('/action/create', body)
      return fromApiResponse(result)
    } else {
      await api.patch(`/action/update/${action.id}`, body)
      return action
    }
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/action/delete/${id}`)
  },

  async testSmb(params: {
    host: string
    port: number
    share: string
    folder: string
    username: string
    password: string
    domain?: string
  }): Promise<{ ok: boolean; message: string }> {
    return api.post<{ ok: boolean; message: string }>('/action/test-smb', {
      smb_host: params.host,
      smb_port: params.port,
      smb_share: params.share,
      smb_folder: params.folder,
      smb_username: params.username,
      smb_password: params.password,
      smb_domain: params.domain ?? '',
    })
  },

  async testTelegram(params: { botToken: string; chatId: string }): Promise<{ ok: boolean; message: string }> {
    return api.post<{ ok: boolean; message: string }>('/action/test-telegram', {
      telegram_bot_token: params.botToken,
      telegram_chat_id: params.chatId,
    })
  },

  async testWhatsApp(params: {
    apiUrl: string
    apiToken: string
    authScheme: WhatsAppAuthScheme
  }): Promise<{ ok: boolean; message: string }> {
    return api.post<{ ok: boolean; message: string }>('/action/test-whatsapp', {
      whatsapp_api_url: params.apiUrl,
      whatsapp_api_token: params.apiToken,
      whatsapp_auth_scheme: params.authScheme,
    })
  },
}
