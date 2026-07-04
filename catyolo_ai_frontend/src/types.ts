// ── Scene ─────────────────────────────────────────────────────────────────────

export type EntityClass = 'person' | 'cat'

export interface Point {
  x: number
  y: number
}

export interface NormZone {
  points: Point[]
  classes: EntityClass[]
  prompt?: string
  vlmDecidesTrigger?: boolean
  depthEnabled?: boolean
  depthMargin?: number
  actionIds?: string[]
}

/** @deprecated Use NormZone instead */
export type NormRect = NormZone

export interface Scene {
  id: string
  name: string
  cameraHost: string
  cameraPort: string
  cameraUsername?: string
  cameraPassword?: string
  zones: NormZone[]
  /** @deprecated Use zones instead */
  rects?: NormZone[]
  scenePrompt?: string
  scenePromptInterval?: number
  scenePromptActionIds?: string[]
  globalDetectionEnabled?: boolean
  globalDetectionClasses?: EntityClass[]
  globalDetectionActionIds?: string[]
  globalDetectionCooldownSeconds?: number
  imageBase64?: string
  imageWidth?: number
  imageHeight?: number
}

// ── Action ────────────────────────────────────────────────────────────────────

export type ActionType = 'telegram' | 'webhook' | 'smbFileshare' | 'whatsapp'

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  telegram: 'Telegram Notification',
  whatsapp: 'WhatsApp Message',
  webhook: 'Webhook',
  smbFileshare: 'SMB Fileshare Upload',
}

export type WebhookAuthType = 'none' | 'basicAuth' | 'apiKey' | 'oauth2'

export const WEBHOOK_AUTH_LABELS: Record<WebhookAuthType, string> = {
  none: 'No Authentication',
  basicAuth: 'Basic Auth',
  apiKey: 'API Key',
  oauth2: 'OAuth 2.0',
}

export type WhatsAppAuthScheme = 'bearer' | 'x-api-key' | 'none'

export const WHATSAPP_AUTH_LABELS: Record<WhatsAppAuthScheme, string> = {
  bearer: 'Bearer Token (Authorization: Bearer …)',
  'x-api-key': 'API Key (X-API-Key: …)',
  none: 'No Authentication',
}

// Default JSON payload template for the Meta Cloud API "messages" endpoint.
// {message}, {class}, {trigger}, {scene}, {ts}, {image_base64} are substituted
// by the worker handler at delivery time.
export const WHATSAPP_DEFAULT_PAYLOAD_TEMPLATE =
  '{\n' +
  '  "messaging_product": "whatsapp",\n' +
  '  "to": "<your-recipient-phone-number>",\n' +
  '  "type": "text",\n' +
  '  "text": { "preview_url": false, "body": "{message}" }\n' +
  '}'

export interface CatyoloAction {
  id: string
  name: string
  type: ActionType
  // telegram
  telegramBotToken?: string
  telegramChatId?: string
  telegramMessageTemplate?: string
  // webhook
  webhookUrl?: string
  webhookAuthType?: WebhookAuthType
  webhookUsername?: string
  webhookPassword?: string
  webhookApiKey?: string
  webhookClientId?: string
  webhookClientSecret?: string
  webhookTokenEndpoint?: string
  // smb fileshare
  smbHost?: string
  smbPort?: number
  smbShare?: string
  smbFolder?: string
  smbUsername?: string
  smbPassword?: string
  smbDomain?: string
  // whatsapp (generic bridge — Meta Cloud API, Twilio, CallMeBot, 360dialog, …)
  whatsappApiUrl?: string
  whatsappApiToken?: string
  whatsappAuthScheme?: WhatsAppAuthScheme
  whatsappPayloadTemplate?: string
  whatsappSendImage?: boolean
}

// ── Navigation ────────────────────────────────────────────────────────────────

export type Page =
  | { name: 'setup' }
  | { name: 'home' }
  | { name: 'sceneConfig'; scene?: Scene }
  | { name: 'actions' }
  | { name: 'depthTuning' }
  | { name: 'settings' }
