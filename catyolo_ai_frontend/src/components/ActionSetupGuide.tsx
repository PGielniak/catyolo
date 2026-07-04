import { useState } from 'react'
import type { ActionType } from '../types'

interface Props {
  type: ActionType
}

/**
 * Collapsible, per-action-type setup guide rendered inside the action dialog.
 * No external dependencies — plain JSX with <details> for the collapsible
 * affordance, plus a clipboard-copy helper for snippets.
 */
export default function ActionSetupGuide({ type }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="font-medium text-gray-700 flex items-center gap-1.5">
          <span>📖</span> Setup guide
        </span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="px-3 py-3 space-y-3 bg-white text-gray-600">
          {type === 'telegram' && <TelegramGuide />}
          {type === 'whatsapp' && <WhatsAppGuide />}
          {type === 'webhook' && <WebhookGuide />}
          {type === 'smbFileshare' && <SmbGuide />}
        </div>
      )}
    </div>
  )
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded p-2 pr-9 overflow-x-auto text-xs"><code>{code}</code></pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => { setCopied(true); setTimeout(() => setCopied(false), 1200) },
            () => {},
          )
        }}
        className="absolute top-1.5 right-1.5 text-xs text-gray-300 hover:text-white bg-gray-700/70 rounded px-1.5 py-0.5"
      >
        {copied ? '✓' : 'copy'}
      </button>
    </div>
  )
}

function TelegramGuide() {
  return (
    <>
      <Step n={1}>
        Create a bot: open Telegram, search <Inline>@BotFather</Inline>, send <Code>/newbot</Code>,
        choose a name and a unique username ending in <Inline>bot</Inline>.
      </Step>
      <Step n={2}>
        BotFather replies with an HTTP API token (looks like <Inline>123456:ABC-DEF…</Inline>).
        Paste it into the <strong>Bot Token</strong> field above.
      </Step>
      <Step n={3}>
        Find your <strong>Chat ID</strong>. Send any message to your new bot, then open:
        <Snippet code="https://api.telegram.org/bot<TOKEN>/getUpdates" />
        Look for <Inline>chat.id</Inline> in the JSON response. For a group chat, the ID is
        negative (e.g. <Inline>-100123456789</Inline>) — add the bot to the group first.
      </Step>
      <Step n={4}>
        (Groups only) Open the group → edit → add the bot as administrator, otherwise it cannot
        see messages. Disable “Privacy Mode” if you want it to receive all messages.
      </Step>
      <Step n={5}>
        Use <strong>Test Connection</strong> above to verify both the token and the chat ID at once.
      </Step>
      <p className="text-xs text-gray-400">
        Full reference: <a className="text-blue-500 hover:underline" target="_blank" rel="noreferrer" href="https://core.telegram.org/bots/api">core.telegram.org/bots/api</a>.
        Credentials are stored write-only (redacted on read-back).
      </p>
    </>
  )
}

function WhatsAppGuide() {
  return (
    <>
      <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded p-2">
        There is no official end-user WhatsApp bot API. This action posts to a <strong>bridge URL</strong>.
        Pick a provider below and copy the matching URL/token into the form. The default payload
        template is preset for the Meta Cloud API but can be edited for any provider.
      </p>

      <h4 className="font-medium text-gray-700 pt-1">Option A — Meta Cloud API (recommended)</h4>
      <Step n={1}>
        Register at <a className="text-blue-500 hover:underline" target="_blank" rel="noreferrer" href="https://business.whatsapp.com/developers/developer-hub">business.whatsapp.com/developers</a>,
        create an app, add a WhatsApp business phone number, and create a System User access token.
      </Step>
      <Step n={2}>
        Bridge URL:<br />
        <Snippet code="https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages" />
        Auth: <strong>Bearer Token</strong> using the System User access token.
      </Step>
      <Step n={3}>
        Template messages must be pre-approved for business-initiated chats. For replies within
        the 24-hour customer service window, free-text is allowed — that is what CatYolo uses.
      </Step>

      <h4 className="font-medium text-gray-700 pt-1">Option B — Twilio WhatsApp</h4>
      <Step n={1}>
        Provision a WhatsApp-enabled number in the Twilio console and copy your Account SID and Auth Token.
      </Step>
      <Step n={2}>
        Bridge URL (basic auth, SID:Token via URL is not supported here — use the generic webhook
        action instead for Twilio):<br />
        <Snippet code="https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json" />
        Recommended: use the <strong>Webhook</strong> action type with Basic Auth for Twilio.
      </Step>

      <h4 className="font-medium text-gray-700 pt-1">Option C — CallMeBot (unofficial, easiest)</h4>
      <Step n={1}>
        Message <Inline>+34 6 xxx</Inline> CallMeBot on WhatsApp, request an API key, then use:
        <Snippet code="https://api.callmebot.com/whatsapp.php?phone=<YOUR_PHONE>&text=<MSG>&apikey=<KEY>" />
      </Step>
      <Step n={2}>
        Set <strong>Auth Scheme</strong> to <Inline>none</Inline> (the key lives in the URL) and
        uncheck <strong>Send image</strong> (CallMeBot is text-only).
      </Step>

      <p className="text-xs text-gray-400">
        Payload template placeholders: <Inline>{'{message}'}</Inline>, <Inline>{'{class}'}</Inline>,
        <Inline>{'{trigger}'}</Inline>, <Inline>{'{scene}'}</Inline>, <Inline>{'{ts}'}</Inline>,
        <Inline>{'{image_base64}'}</Inline> (base64-encoded annotated JPEG).
      </p>
      <p className="text-xs text-gray-400">
        Use <strong>Test Connection</strong> to POST a minimal payload to your bridge URL before saving.
      </p>
    </>
  )
}

function WebhookGuide() {
  return (
    <>
      <Step n={1}>
        Provide the HTTPS endpoint that will receive the alert. CatYolo posts <Inline>multipart/form-data</Inline>
        with fields: <Inline>metadata</Inline> (JSON string), <Inline>image</Inline> (annotated JPEG)
        and <Inline>trigger</Inline>, <Inline>scene_id</Inline>, <Inline>detected_class</Inline>,
        <Inline>timestamp</Inline>.
      </Step>
      <Step n={2}>
        Pick an authentication scheme matching your endpoint. For OAuth 2.0, CatYolo caches a
        client-credentials token and refreshes it 30 s before expiry.
      </Step>
      <Step n={3}>
        Receiving servers should return 2xx; non-2xx is retried up to 3 times with backoff.
      </Step>
    </>
  )
}

function SmbGuide() {
  return (
    <>
      <Step n={1}>
        The SMB share must be reachable from the <strong>worker host</strong> (the Pi), not your
        browser. Check LAN/Tailscale routing.
      </Step>
      <Step n={2}>
        SMB2/3 only (SMB1 disabled). Most Windows shares, Samba, and Synology are SMB2/3 by default.
      </Step>
      <Step n={3}>
        Each event is written to <Inline>{'<scene>/<timestamp>_<trigger>/'}</Inline> containing
        <Inline> raw_frame.jpg</Inline>, <Inline>annotated.jpg</Inline> and <Inline>metadata.json</Inline>.
      </Step>
      <Step n={4}>
        Use <strong>Test Connection</strong> — it writes and then deletes a tiny file in the target folder.
      </Step>
    </>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="flex-none w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-medium">{n}</span>
      <div className="flex-1 space-y-1.5">{children}</div>
    </div>
  )
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs">{children}</code>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs">{children}</code>
}