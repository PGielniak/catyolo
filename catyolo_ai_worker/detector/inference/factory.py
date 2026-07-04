import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Optional

import numpy as np
import yaml

from detector.capture import FrameCapture
from detector.inference.protocols import InferenceBackend

logger = logging.getLogger(__name__)

_SUPPORTED_ARCHS = ("hailo10h", "hailo8")


class NoHailoDeviceError(RuntimeError):
    """Raised when the Hailo SDK is missing or no Hailo device is present."""


def probe_hailo_devices() -> tuple[list[str], Optional[str]]:
    """Return (device_ids, probed_arch) for the local Hailo hardware.

    Raises NoHailoDeviceError if the Hailo SDK is not installed or if the
    device scan returns no devices. The architecture probe uses hailortcli
    when available and falls back to None.

    Lazy-imports hailo_platform so the module imports cleanly on dev
    machines / CI without a Hailo chip.
    """
    try:
        from hailo_platform import Device
    except Exception as e:
        raise NoHailoDeviceError(
            "hailo_platform is not installed; Hailo SDK is missing"
        ) from e

    with Device() as dev:
        device_ids = dev.scan()
    logger.info("Available Hailo devices: %s", device_ids)

    if not device_ids:
        raise NoHailoDeviceError("No Hailo devices found")

    probed_arch: Optional[str] = None
    try:
        result = subprocess.run(
            ["hailortcli", "fw-control", "identify"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = (result.stdout + result.stderr).lower()
        if "hailo10h" in output or "hailo-10h" in output:
            probed_arch = "hailo10h"
        elif "hailo8" in output or "hailo-8" in output:
            probed_arch = "hailo8"
    except Exception:
        logger.debug("Could not probe Hailo architecture via hailortcli", exc_info=True)

    return device_ids, probed_arch


def create_shared_device() -> Any:
    """Create ONE VDevice shared across all per-scene backends.

    Uses HailoRT's ROUND_ROBIN scheduler with group_id='SHARED' so frames
    submitted by every per-scene pipeline's backend are multiplexed across
    the single physical device. This is the multi-camera enabler: instead
    of each backend opening (and on reload releasing) its own VDevice, all
    backends attach to this shared device and only own their per-backend
    model handles (released on reload/teardown, leaving the device open).

    Probes for the presence of a Hailo device first and raises
    NoHailoDeviceError if none is found.
    """
    from hailo_platform import HailoSchedulingAlgorithm, VDevice

    device_ids, _ = probe_hailo_devices()
    params = VDevice.create_params()
    params.scheduling_algorithm = HailoSchedulingAlgorithm.ROUND_ROBIN
    params.group_id = "SHARED"
    logger.info(
        "Created shared VDevice for devices %s (ROUND_ROBIN / SHARED)", device_ids
    )
    return VDevice(params)


def release_shared_device(device: Any) -> None:
    """Release the shared VDevice exactly once at worker shutdown."""
    if device is None:
        return
    try:
        device.release()
        logger.info("Shared VDevice released")
    except Exception:
        logger.exception("Error releasing shared VDevice")


def create_backend(
    capture: FrameCapture,
    yolo_classes: list[str],
    reference_image: Optional[np.ndarray] = None,
    red_zones: Optional[list] = None,
    shared_device: Any = None,
) -> InferenceBackend:
    """Probe the installed Hailo chip (or read HAILO_ARCH env) and return the
    appropriate backend configured with HEF paths from the per-arch manifest.

    When `shared_device` is provided (a VDevice created by create_shared_device),
    the backend attaches to it instead of opening its own — this is the
    multi-camera path. When None (legacy/tests), the backend owns its VDevice.
    """
    arch = os.getenv("HAILO_ARCH", "").strip().lower() or _probe_arch()
    if arch not in _SUPPORTED_ARCHS:
        logger.warning("Unknown HAILO_ARCH=%r; falling back to hailo10h", arch)
        arch = "hailo10h"

    hef_config = _load_manifest(arch)
    logger.info(
        "Creating %s backend (HAILO_ARCH=%s, shared_device=%s)",
        arch, arch, shared_device is not None,
    )

    if arch == "hailo10h":
        from detector.inference.hailo10_backend import Hailo10Backend
        return Hailo10Backend(
            capture=capture,
            yolo_classes=yolo_classes,
            hef_config=hef_config,
            reference_image=reference_image,
            red_zones=red_zones,
            shared_device=shared_device,
        )
    else:
        from detector.inference.hailo8_backend import Hailo8Backend
        return Hailo8Backend(
            capture=capture,
            yolo_classes=yolo_classes,
            hef_config=hef_config,
            reference_image=reference_image,
            red_zones=red_zones,
            shared_device=shared_device,
        )


def _probe_arch() -> str:
    """Identify the Hailo chip. Falls back to hailo10h on error."""
    try:
        _, probed_arch = probe_hailo_devices()
        if probed_arch == "hailo10h":
            logger.info("Detected Hailo-10H")
            return "hailo10h"
        if probed_arch == "hailo8":
            logger.info("Detected Hailo-8")
            return "hailo8"
        logger.warning(
            "hailortcli output did not identify arch; defaulting to hailo10h"
        )
        return "hailo10h"
    except NoHailoDeviceError as e:
        logger.warning("Could not probe Hailo arch (%s); defaulting to hailo10h", e)
        return "hailo10h"
    except Exception as e:
        logger.warning("Could not probe Hailo arch (%s); defaulting to hailo10h", e)
        return "hailo10h"


def _load_manifest(arch: str) -> dict:
    """Load hefs/<arch>/manifest.yaml, resolving paths relative to HEF_DIR."""
    hef_dir = Path(os.getenv("HEF_DIR", "hefs")).resolve()
    manifest_path = hef_dir / arch / "manifest.yaml"

    if not manifest_path.exists():
        raise FileNotFoundError(
            f"HEF manifest not found: {manifest_path}. "
            f"Set HEF_DIR or create hefs/{arch}/manifest.yaml."
        )

    with open(manifest_path) as f:
        raw: dict = yaml.safe_load(f)

    arch_dir = hef_dir / arch
    resolved: dict = {}
    for key, entry in raw.items():
        if not isinstance(entry, dict) or "path" not in entry:
            continue
        p = Path(entry["path"])
        if not p.is_absolute():
            p = arch_dir / p
        resolved[key] = {**entry, "path": str(p)}

    return resolved
