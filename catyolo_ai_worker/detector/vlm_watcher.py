"""VlmSettingWatcher — polls the backend's global vlm_enabled setting and
fires a one-shot callback when it differs from the value the worker process
started with.

Why a restart instead of hot-unload: the Hailo-10H VLM owns the chip's
single KV-Cache and is a process-wide singleton shared by all per-scene
backends. The only reliable way to fully evict it from device memory (or
load it into a running worker) is a full process restart — main() performs
an orderly teardown and re-execs itself.
"""

import logging
import os
import threading
from typing import Callable, Optional

from detector.settings import fetch_vlm_enabled

logger = logging.getLogger(__name__)


class VlmSettingWatcher:
    def __init__(
        self,
        api_base: str,
        initial_enabled: bool,
        on_change: Callable[[bool], None],
        poll_interval: Optional[float] = None,
        api_key: Optional[str] = None,
    ):
        self._api_base = api_base.rstrip("/")
        self._initial_enabled = initial_enabled
        self._on_change = on_change
        self._poll_interval = (
            poll_interval
            if poll_interval is not None
            else float(os.getenv("SETTINGS_POLL_INTERVAL", "2.0"))
        )
        self._api_key = api_key
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._thread is not None:
            logger.warning("VlmSettingWatcher already started")
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="vlm-setting-watcher"
        )
        self._thread.start()

    def stop(self, timeout: float = 3.0):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=timeout)

    def _run(self):
        logger.info(
            "VlmSettingWatcher started — polling %s/settings/vlm every %.1fs (started with vlm_enabled=%s)",
            self._api_base,
            self._poll_interval,
            self._initial_enabled,
        )
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception:
                logger.exception("VlmSettingWatcher tick failed")
            self._stop_event.wait(self._poll_interval)

    def _tick(self):
        current = fetch_vlm_enabled(self._api_base, api_key=self._api_key)
        if current is None:
            # Transient failure — never restart on unknown state.
            return
        if current != self._initial_enabled:
            logger.info(
                "vlm_enabled changed %s -> %s; requesting worker restart",
                self._initial_enabled,
                current,
            )
            try:
                self._on_change(current)
            finally:
                self._stop_event.set()
