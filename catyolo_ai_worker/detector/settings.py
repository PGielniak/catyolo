"""Client helpers for the backend's global settings (worker side).

The worker reads `vlm_enabled` once at startup (to decide whether to load
the VLM onto the Hailo-10H at all) and then polls it via VlmSettingWatcher
to trigger a self-restart when the value flips.
"""

import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def fetch_vlm_enabled(
    api_base: str,
    api_key: Optional[str] = None,
    timeout: float = 3.0,
) -> Optional[bool]:
    """GET /settings/vlm from the backend.

    Returns None on any failure (backend down, bad payload, auth error) so
    callers can distinguish "unknown" from a real False. Startup treats None
    as True (historical default); the watcher treats None as "skip this
    tick" so a transient backend outage never triggers a spurious restart.
    """
    try:
        headers = {"X-API-Key": api_key} if api_key else {}
        r = requests.get(
            f"{api_base.rstrip('/')}/settings/vlm", headers=headers, timeout=timeout
        )
        r.raise_for_status()
        return bool(r.json().get("vlm_enabled", True))
    except Exception as e:
        logger.warning("Failed to fetch vlm_enabled setting: %s", e)
        return None
