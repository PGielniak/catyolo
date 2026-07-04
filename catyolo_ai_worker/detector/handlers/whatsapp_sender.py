"""WhatsApp bridge alert handler.

Posts a JSON payload to a user-configured "bridge" URL. WhatsApp has no
official end-user bot API, so CatYolo treats WhatsApp as a generic HTTP
bridge — the user points this action at any WhatsApp-capable endpoint
(Meta Cloud API, Twilio, CallMeBot, 360dialog, …), optionally supplies an
auth token, and supplies a JSON payload template whose placeholders are
substituted per event.

The default payload template is preset (in the frontend) for the Meta
Cloud API `messages` endpoint, but any JSON body is accepted.

Substituted placeholders (literal string replacement, NOT str.format, so
literal JSON braces in the template are left untouched):
    {message}        - the rendered text message
    {class}          - detected class, or "object"
    {trigger}        - trigger name (overlap, vlm_yes, ...)
    {scene}          - scene_id, or "unknown-scene"
    {ts}             - event timestamp as "YYYY-MM-DD HH:MM:SS"
    {image_base64}   - the annotated JPEG, base64-encoded (or empty string)
"""

import base64
import json
import logging
import threading
import time
from typing import Optional

import requests

from detector.events import DetectionEvent
from detector.handlers.base import BaseActionHandler, render_text_template

logger = logging.getLogger(__name__)


# HTTP retry behaviour — mirrors WebhookDispatcherHandler.
MAX_RETRIES = 2  # attempts beyond the first (so up to 3 total POSTs)
RETRY_BACKOFF = (1.0, 2.0)  # seconds between retries
REQUEST_TIMEOUT = 15.0


class WhatsAppSenderHandler(BaseActionHandler):
    def __init__(self, action_id: str, action_name: str, config: dict):
        url = (config.get("whatsappApiUrl") or "").strip()
        if not url:
            raise ValueError("WhatsAppSenderHandler requires whatsappApiUrl")
        self._url = url
        self._auth_scheme = (config.get("whatsappAuthScheme") or "bearer").strip()
        if self._auth_scheme not in ("bearer", "x-api-key", "none"):
            raise ValueError(f"Unsupported whatsappAuthScheme: {self._auth_scheme!r}")
        self._token = (config.get("whatsappApiToken") or "").strip()
        if self._auth_scheme != "none" and not self._token:
            raise ValueError(
                f"whatsappApiToken is required when whatsappAuthScheme={self._auth_scheme!r}"
            )
        self._payload_template = (config.get("whatsappPayloadTemplate") or "").strip()
        if not self._payload_template:
            # No template -> fall back to a minimal text message JSON.
            self._payload_template = json.dumps({"text": "{message}"})
        self._send_image = bool(config.get("whatsappSendImage", True))

        self._session = requests.Session()
        self._session_lock = threading.Lock()

        super().__init__(action_id, action_name)
        # Avoid ever logging the token.
        logger.info(
            "WhatsAppSenderHandler configured — url=%s auth=%s send_image=%s",
            self._url, self._auth_scheme, self._send_image,
        )

    # ------------------------------------------------------------------ #

    def _thread_name(self) -> str:
        return f"whatsapp-{self._action_id[:8]}"

    def _deliver(self, event: DetectionEvent, payload: dict) -> None:
        body = self._build_body(event, payload)
        headers = self._build_headers()
        last_exc: Optional[Exception] = None
        for attempt in range(MAX_RETRIES + 1):
            with self._session_lock:
                try:
                    r = self._session.post(
                        self._url,
                        data=body.encode("utf-8") if isinstance(body, str) else body,
                        headers=headers,
                        timeout=REQUEST_TIMEOUT,
                    )
                except Exception as e:
                    last_exc = e
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_BACKOFF[attempt])
                        continue
                    raise
            if 200 <= r.status_code < 300:
                logger.info(
                    "WhatsApp send ok — action=%s status=%d trigger=%s",
                    self._action_id, r.status_code, event.trigger,
                )
                return
            logger.warning(
                "WhatsApp send non-2xx — action=%s status=%d body=%s",
                self._action_id, r.status_code, r.text[:200],
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF[attempt])
                continue
            raise RuntimeError(
                f"WhatsApp bridge {self._url} returned {r.status_code} "
                f"after {MAX_RETRIES + 1} attempts"
            )
        if last_exc:
            raise last_exc

    # ------------------------------------------------------------------ #
    # Payload + header construction
    # ------------------------------------------------------------------ #

    def _build_body(self, event: DetectionEvent, payload: dict) -> str:
        # Render the human text message first using the standard placeholder
        # set; this becomes the {message} value inside the JSON template.
        message_text = render_text_template(
            "{trigger}: {class} at {scene} ({ts})", event,
        )
        image_b64 = ""
        if self._send_image:
            image_bytes = payload["annotated_jpeg"] or payload["raw_jpeg"]
            if image_bytes:
                image_b64 = base64.b64encode(image_bytes).decode("ascii")

        # Literal replacement — NOT str.format — so JSON braces in the user's
        # template are preserved. Placeholders are escaped-free strings.
        body = self._payload_template
        body = body.replace("{message}", message_text)
        body = body.replace("{class}", event.detected_class or "object")
        body = body.replace("{trigger}", event.trigger)
        body = body.replace("{scene}", event.scene_id or "unknown-scene")
        body = body.replace("{ts}", event.timestamp.strftime("%Y-%m-%d %H:%M:%S"))
        body = body.replace("{image_base64}", image_b64)
        return body

    def _build_headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "CatYolo/1.0",
        }
        if self._auth_scheme == "bearer":
            headers["Authorization"] = f"Bearer {self._token}"
        elif self._auth_scheme == "x-api-key":
            headers["X-API-Key"] = self._token
        return headers

    # ------------------------------------------------------------------ #

    def stop(self) -> None:
        super().stop()
        try:
            self._session.close()
        except Exception:
            pass