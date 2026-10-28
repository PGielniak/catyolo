import logging

from database.sqlite import SqliteDatabase

logger = logging.getLogger("catyolo_backend")


class SettingsService:
    """Business logic for global key/value settings.

    Currently exposes only `vlm_enabled` — the master switch for all VLM
    capabilities on the Hailo-10H worker. The worker reads it at startup
    (and polls it for changes); when it flips, the worker restarts itself
    so the VLM is fully loaded into / evicted from device memory.
    """

    VLM_ENABLED_KEY = "vlm_enabled"

    def __init__(self, database: SqliteDatabase):
        self._db = database

    def get_vlm_enabled(self) -> bool:
        """Default True when the setting was never written — preserves the
        historical behavior (VLM always loaded) for existing deployments."""
        raw = self._db.get_setting(self.VLM_ENABLED_KEY)
        if raw is None:
            return True
        return raw.strip().lower() in ("1", "true", "yes", "on")

    def set_vlm_enabled(self, enabled: bool) -> bool:
        logger.info("Setting vlm_enabled -> %s", enabled)
        self._db.set_setting(self.VLM_ENABLED_KEY, "true" if enabled else "false")
        return enabled
