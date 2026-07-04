import { useEffect, useState } from 'react'
import type { CatyoloAction, ActionType, WebhookAuthType, WhatsAppAuthScheme, Page } from '../types'
import { ACTION_TYPE_LABELS, WEBHOOK_AUTH_LABELS, WHATSAPP_AUTH_LABELS, WHATSAPP_DEFAULT_PAYLOAD_TEMPLATE } from '../types'
import { actionService } from '../services/actionService'
import ActionSetupGuide from '../components/ActionSetupGuide'

interface Props {
  navigate: (p: Page) => void
}

export default function ActionsPage({ navigate }: Props) {
  const [actions, setActions] = useState<CatyoloAction[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CatyoloAction | null | undefined>(undefined)
  // undefined = not open, null = new, CatyoloAction = edit

  async function load() {
    setLoading(true)
    setActions(await actionService.loadAll())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(action: CatyoloAction) {
    if (!confirm(`Delete "${action.name}"? Any scenes that reference it will retain the stale ID.`)) return
    await actionService.delete(action.id)
    load()
  }

  async function handleSave(action: CatyoloAction) {
    await actionService.upsert(action)
    setEditing(undefined)
    load()
  }

  function iconForType(type: ActionType) {
    const icons: Record<ActionType, string> = {
      telegram: '✈️',
      whatsapp: '💬',
      webhook: '🔗',
      smbFileshare: '📁',
    }
    return icons[type]
  }

  function subtitleForAction(a: CatyoloAction) {
    switch (a.type) {
      case 'telegram': return `Chat: ${a.telegramChatId ?? '—'}`
      case 'whatsapp': return `${a.whatsappApiUrl ?? '—'} · ${a.whatsappAuthScheme ?? 'bearer'}`
      case 'webhook': return `${a.webhookUrl ?? '—'} · ${a.webhookAuthType ?? 'none'}`
      case 'smbFileshare':
        return `${a.smbHost ?? '—'}:${a.smbPort ?? 445}/${a.smbShare ?? '—'}/${a.smbFolder ?? '—'}`
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ name: 'settings' })} className="text-gray-500 hover:text-gray-800">←</button>
        <h1 className="text-lg font-bold flex-1">Configure Actions</h1>
        <button
          onClick={() => setEditing(null)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Add
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-20 text-gray-400">Loading…</div>
        ) : actions.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🔔</div>
            <p className="mb-6">No actions defined yet.</p>
            <button onClick={() => setEditing(null)} className="btn-primary">+ Add Action</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y overflow-hidden">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{iconForType(a.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {ACTION_TYPE_LABELS[a.type]} · {subtitleForAction(a)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">✏️</button>
                  <button onClick={() => handleDelete(a)} className="p-1.5 rounded hover:bg-gray-100 text-red-500">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing !== undefined && (
        <ActionDialog
          existing={editing}
          onSave={handleSave}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

// ── Action Dialog ─────────────────────────────────────────────────────────────

interface DialogProps {
  existing: CatyoloAction | null
  onSave: (a: CatyoloAction) => void
  onCancel: () => void
}

function ActionDialog({ existing, onSave, onCancel }: DialogProps) {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<ActionType>(existing?.type ?? 'telegram')
  // Telegram
  const [tgToken, setTgToken] = useState(existing?.telegramBotToken ?? '')
  const [tgChat, setTgChat] = useState(existing?.telegramChatId ?? '')
  const [tgTemplate, setTgTemplate] = useState(existing?.telegramMessageTemplate ?? '')
  // Webhook
  const [whUrl, setWhUrl] = useState(existing?.webhookUrl ?? '')
  const [whAuth, setWhAuth] = useState<WebhookAuthType>(existing?.webhookAuthType ?? 'none')
  const [whUser, setWhUser] = useState(existing?.webhookUsername ?? '')
  const [whPass, setWhPass] = useState(existing?.webhookPassword ?? '')
  const [whApiKey, setWhApiKey] = useState(existing?.webhookApiKey ?? '')
  const [whClientId, setWhClientId] = useState(existing?.webhookClientId ?? '')
  const [whClientSecret, setWhClientSecret] = useState(existing?.webhookClientSecret ?? '')
  const [whTokenEndpoint, setWhTokenEndpoint] = useState(existing?.webhookTokenEndpoint ?? '')
  // SMB
  const [smbHost, setSmbHost] = useState(existing?.smbHost ?? '')
  const [smbPort, setSmbPort] = useState<string>(existing?.smbPort ? String(existing.smbPort) : '445')
  const [smbShare, setSmbShare] = useState(existing?.smbShare ?? '')
  const [smbFolder, setSmbFolder] = useState(existing?.smbFolder ?? '')
  const [smbUsername, setSmbUsername] = useState(existing?.smbUsername ?? '')
  const [smbPassword, setSmbPassword] = useState(existing?.smbPassword ?? '')
  const [smbDomain, setSmbDomain] = useState(existing?.smbDomain ?? '')
  // WhatsApp
  const [waUrl, setWaUrl] = useState(existing?.whatsappApiUrl ?? '')
  const [waToken, setWaToken] = useState(existing?.whatsappApiToken ?? '')
  const [waAuth, setWaAuth] = useState<WhatsAppAuthScheme>(existing?.whatsappAuthScheme ?? 'bearer')
  const [waPayload, setWaPayload] = useState(existing?.whatsappPayloadTemplate ?? WHATSAPP_DEFAULT_PAYLOAD_TEMPLATE)
  const [waSendImage, setWaSendImage] = useState<boolean>(existing?.whatsappSendImage ?? false)
  // Visibility toggles
  const [showTgToken, setShowTgToken] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [showSmbPass, setShowSmbPass] = useState(false)
  const [showWaToken, setShowWaToken] = useState(false)
  const [smbTestStatus, setSmbTestStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [smbTesting, setSmbTesting] = useState(false)
  const [tgTestStatus, setTgTestStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [tgTesting, setTgTesting] = useState(false)
  const [waTestStatus, setWaTestStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [waTesting, setWaTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (type === 'telegram' && !tgToken.trim()) { setError('Bot token is required'); return }
    if (type === 'telegram' && !tgChat.trim()) { setError('Chat ID is required'); return }
    if (type === 'whatsapp' && !waUrl.trim()) { setError('WhatsApp bridge URL is required'); return }
    if (type === 'webhook' && !whUrl.trim()) { setError('Webhook URL is required'); return }
    if (type === 'smbFileshare') {
      if (!smbHost.trim()) { setError('SMB host is required'); return }
      if (!smbShare.trim()) { setError('SMB share is required'); return }
      if (!smbFolder.trim()) { setError('SMB folder is required'); return }
      if (!smbUsername.trim()) { setError('SMB username is required'); return }
      if (!smbPassword) { setError('SMB password is required'); return }
      const portNum = parseInt(smbPort, 10)
      if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
        setError('SMB port must be a number between 1 and 65535')
        return
      }
    }

    const action: CatyoloAction = {
      id: existing?.id ?? '',
      name: name.trim(),
      type,
      ...(type === 'telegram' ? {
        telegramBotToken: tgToken.trim() || undefined,
        telegramChatId: tgChat.trim() || undefined,
        telegramMessageTemplate: tgTemplate.trim() || undefined,
      } : {}),
      ...(type === 'whatsapp' ? {
        whatsappApiUrl: waUrl.trim(),
        whatsappApiToken: waToken.trim() || undefined,
        whatsappAuthScheme: waAuth,
        whatsappPayloadTemplate: waPayload.trim() || undefined,
        whatsappSendImage: waSendImage,
      } : {}),
      ...(type === 'webhook' ? {
        webhookUrl: whUrl.trim() || undefined,
        webhookAuthType: whAuth,
        ...(whAuth === 'basicAuth' ? { webhookUsername: whUser.trim() || undefined, webhookPassword: whPass.trim() || undefined } : {}),
        ...(whAuth === 'apiKey' ? { webhookApiKey: whApiKey.trim() || undefined } : {}),
        ...(whAuth === 'oauth2' ? { webhookClientId: whClientId.trim() || undefined, webhookClientSecret: whClientSecret.trim() || undefined, webhookTokenEndpoint: whTokenEndpoint.trim() || undefined } : {}),
      } : {}),
      ...(type === 'smbFileshare' ? {
        smbHost: smbHost.trim(),
        smbPort: parseInt(smbPort, 10) || 445,
        smbShare: smbShare.trim(),
        smbFolder: smbFolder.trim().replace(/^\/+|\/+$/g, ''),
        smbUsername: smbUsername.trim(),
        smbPassword: smbPassword,
        smbDomain: smbDomain.trim() || undefined,
      } : {}),
    }
    onSave(action)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-6 pb-0">
          <h2 className="font-bold text-lg mb-4">{existing ? 'Edit Action' : 'New Action'}</h2>
        </div>

        <form onSubmit={submit} className="overflow-y-auto px-6 pb-6 space-y-4 flex-1">
          <Field label="Action Name *">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field label="Type">
            <select className="field" value={type} onChange={(e) => setType(e.target.value as ActionType)}>
              {(Object.entries(ACTION_TYPE_LABELS) as [ActionType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <hr />

          {type === 'telegram' && (
            <>
              <Field label="Bot Token *">
                <SecretInput value={tgToken} onChange={(v) => { setTgToken(v); setTgTestStatus(null) }} show={showTgToken} onToggle={() => setShowTgToken((v) => !v)} />
              </Field>
              <Field label="Chat ID *">
                <input className="field" placeholder="-100123456789" value={tgChat} onChange={(e) => { setTgChat(e.target.value); setTgTestStatus(null) }} />
              </Field>
              <Field label="Message Template (optional)">
                <textarea
                  className="field"
                  rows={2}
                  placeholder="🚨 {trigger} detected: {class} at {ts}"
                  value={tgTemplate}
                  onChange={(e) => setTgTemplate(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Placeholders: <code>{'{trigger}'}</code>, <code>{'{class}'}</code>, <code>{'{ts}'}</code>
                </p>
              </Field>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!tgToken.trim() || !tgChat.trim() || tgTesting}
                  onClick={async () => {
                    setTgTesting(true)
                    setTgTestStatus(null)
                    try {
                      const result = await actionService.testTelegram({
                        botToken: tgToken.trim(),
                        chatId: tgChat.trim(),
                      })
                      setTgTestStatus(result)
                    } catch (e) {
                      setTgTestStatus({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
                    } finally {
                      setTgTesting(false)
                    }
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tgTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {tgTestStatus && (
                  <span className={`text-sm ${tgTestStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {tgTestStatus.ok ? '✓' : '✗'} {tgTestStatus.message}
                  </span>
                )}
              </div>
              <ActionSetupGuide type="telegram" />
            </>
          )}

          {type === 'whatsapp' && (
            <>
              <Field label="Bridge URL *">
                <input
                  className="field"
                  type="url"
                  placeholder="https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages"
                  value={waUrl}
                  onChange={(e) => { setWaUrl(e.target.value); setWaTestStatus(null) }}
                />
              </Field>
              <Field label="Auth Scheme">
                <select className="field" value={waAuth} onChange={(e) => { setWaAuth(e.target.value as WhatsAppAuthScheme); setWaTestStatus(null) }}>
                  {(Object.entries(WHATSAPP_AUTH_LABELS) as [WhatsAppAuthScheme, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              {waAuth !== 'none' && (
                <Field label="API Token *">
                  <SecretInput value={waToken} onChange={(v) => { setWaToken(v); setWaTestStatus(null) }} show={showWaToken} onToggle={() => setShowWaToken((v) => !v)} />
                </Field>
              )}
              <Field label="Payload Template (JSON)">
                <textarea
                  className="field font-mono text-xs"
                  rows={6}
                  value={waPayload}
                  onChange={(e) => setWaPayload(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Placeholders: <code>{'{message}'}</code>, <code>{'{class}'}</code>, <code>{'{trigger}'}</code>,
                  <code>{'{scene}'}</code>, <code>{'{ts}'}</code>, <code>{'{image_base64}'}</code>
                </p>
              </Field>
              <Field label="Send image">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waSendImage}
                    onChange={(e) => setWaSendImage(e.target.checked)}
                  />
                  <span>Embed the annotated JPEG as base64 in the <code>{'{image_base64}'}</code> placeholder</span>
                </label>
              </Field>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!waUrl.trim() || (waAuth !== 'none' && !waToken.trim()) || waTesting}
                  onClick={async () => {
                    setWaTesting(true)
                    setWaTestStatus(null)
                    try {
                      const result = await actionService.testWhatsApp({
                        apiUrl: waUrl.trim(),
                        apiToken: waToken.trim(),
                        authScheme: waAuth,
                      })
                      setWaTestStatus(result)
                    } catch (e) {
                      setWaTestStatus({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
                    } finally {
                      setWaTesting(false)
                    }
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {waTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {waTestStatus && (
                  <span className={`text-sm ${waTestStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {waTestStatus.ok ? '✓' : '✗'} {waTestStatus.message}
                  </span>
                )}
              </div>
              <ActionSetupGuide type="whatsapp" />
            </>
          )}

          {type === 'webhook' && (
            <>
              <Field label="Webhook URL *">
                <input className="field" type="url" placeholder="https://example.com/hook" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} />
              </Field>
              <Field label="Authentication Type">
                <select className="field" value={whAuth} onChange={(e) => setWhAuth(e.target.value as WebhookAuthType)}>
                  {(Object.entries(WEBHOOK_AUTH_LABELS) as [WebhookAuthType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              {whAuth === 'basicAuth' && (
                <>
                  <Field label="Username *">
                    <input className="field" value={whUser} onChange={(e) => setWhUser(e.target.value)} />
                  </Field>
                  <Field label="Password *">
                    <SecretInput value={whPass} onChange={setWhPass} show={showPass} onToggle={() => setShowPass((v) => !v)} />
                  </Field>
                </>
              )}
              {whAuth === 'apiKey' && (
                <Field label="API Key *">
                  <SecretInput value={whApiKey} onChange={setWhApiKey} show={showApiKey} onToggle={() => setShowApiKey((v) => !v)} />
                  <p className="text-xs text-gray-400 mt-1">Sent as <code>Authorization: Bearer …</code></p>
                </Field>
              )}
              {whAuth === 'oauth2' && (
                <>
                  <Field label="Client ID *">
                    <input className="field" value={whClientId} onChange={(e) => setWhClientId(e.target.value)} />
                  </Field>
                  <Field label="Client Secret *">
                    <SecretInput value={whClientSecret} onChange={setWhClientSecret} show={showSecret} onToggle={() => setShowSecret((v) => !v)} />
                  </Field>
                  <Field label="Token Endpoint URL *">
                    <input className="field" type="url" value={whTokenEndpoint} onChange={(e) => setWhTokenEndpoint(e.target.value)} />
                  </Field>
                </>
              )}
              <ActionSetupGuide type="webhook" />
            </>
          )}

          {type === 'smbFileshare' && (
            <>
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded p-2">
                The share must be reachable from the worker host (LAN, Tailscale, or any routable IP).
                Each event lands in a timestamped subfolder containing
                <code> raw_frame.jpg</code>, <code>annotated.jpg</code>, and <code>metadata.json</code>.
              </p>
              <Field label="Host (IP or hostname) *">
                <input className="field" placeholder="192.168.1.10" value={smbHost} onChange={(e) => { setSmbHost(e.target.value); setSmbTestStatus(null) }} />
              </Field>
              <Field label="Port *">
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={65535}
                  value={smbPort}
                  onChange={(e) => { setSmbPort(e.target.value); setSmbTestStatus(null) }}
                />
              </Field>
              <Field label="Share *">
                <input className="field" placeholder="catyolo" value={smbShare} onChange={(e) => { setSmbShare(e.target.value); setSmbTestStatus(null) }} />
              </Field>
              <Field label="Folder (under share) *">
                <input
                  className="field"
                  placeholder="events"
                  value={smbFolder}
                  onChange={(e) => { setSmbFolder(e.target.value); setSmbTestStatus(null) }}
                />
                <p className="text-xs text-gray-400 mt-1">Subfolders allowed (e.g. <code>events/cam1</code>). Leading/trailing slashes are trimmed.</p>
              </Field>
              <Field label="Username *">
                <input className="field" value={smbUsername} onChange={(e) => { setSmbUsername(e.target.value); setSmbTestStatus(null) }} />
              </Field>
              <Field label="Password *">
                <SecretInput value={smbPassword} onChange={(v) => { setSmbPassword(v); setSmbTestStatus(null) }} show={showSmbPass} onToggle={() => setShowSmbPass((v) => !v)} />
              </Field>
              <Field label="Domain (optional)">
                <input className="field" placeholder="WORKGROUP" value={smbDomain} onChange={(e) => { setSmbDomain(e.target.value); setSmbTestStatus(null) }} />
              </Field>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!smbHost.trim() || !smbShare.trim() || !smbFolder.trim() || !smbUsername.trim() || !smbPassword || smbTesting}
                  onClick={async () => {
                    setSmbTesting(true)
                    setSmbTestStatus(null)
                    try {
                      const result = await actionService.testSmb({
                        host: smbHost.trim(),
                        port: parseInt(smbPort, 10) || 445,
                        share: smbShare.trim(),
                        folder: smbFolder.trim().replace(/^\/+|\/+$/g, ''),
                        username: smbUsername.trim(),
                        password: smbPassword,
                        domain: smbDomain.trim() || undefined,
                      })
                      setSmbTestStatus(result)
                    } catch (e) {
                      setSmbTestStatus({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
                    } finally {
                      setSmbTesting(false)
                    }
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {smbTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {smbTestStatus && (
                  <span className={`text-sm ${smbTestStatus.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {smbTestStatus.ok ? '✓' : '✗'} {smbTestStatus.message}
                  </span>
                )}
              </div>
              <ActionSetupGuide type="smbFileshare" />
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 border rounded-lg py-2 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 font-medium">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  )
}

interface SecretInputProps {
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
}

function SecretInput({ value, onChange, show, onToggle }: SecretInputProps) {
  return (
    <div className="relative">
      <input
        className="field pr-10"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
