# CatYolo

Real-time computer-vision monitoring for edge devices. CatYolo watches one or more RTSP camera feeds, detects forbidden entities (people, cats, etc.) entering user-defined red zones, and triggers alerts via Telegram, webhook, or SMB file share.

Built for the Raspberry Pi 5 with a Hailo AI accelerator (Hailo-10H or Hailo-8).

## Features

- **Multi-stage detection pipeline** — cheap CPU occlusion checks gate expensive Hailo NPU inference (YOLO object detection, monocular depth, vision-language model confirmation).
- **Multi-camera support** — up to 3 simultaneous RTSP feeds, each with independent red zones and prompts.
- **Per-zone VLM prompts** — ask a vision-language model a custom question for each red zone; supports a `{class}` placeholder.
- **Web config UI** — draw red zones on a camera frame, attach actions, manage scenes and API keys.
- **Real API-key auth** — hashed keys stored locally in SQLite; no secrets returned by the REST API.
- **Auto chip detection** — detects Hailo-10H vs Hailo-8 at startup and loads the correct HEF set.
- **Hot config reload** — add, edit, or remove scenes in the UI; the worker picks up changes without a restart.
- **systemd deployment** — one installer sets up users, directories, dependencies, and services on a fresh Pi.

## Architecture

The project is a single repo containing three services:

| Service | Directory | Stack | Default port |
|---|---|---|---|
| Backend | `catyolo_ai_backend/` | FastAPI, SQLAlchemy 2, SQLite | 8100 |
| Frontend | `catyolo_ai_frontend/` | React 18, TypeScript, Vite, Tailwind | 3100 (via `serve.py`) |
| Worker | `catyolo_ai_worker/` | Python 3.13, OpenCV, Hailo SDK | debug stream 5001 |

- The frontend proxies API calls to the backend.
- The worker polls the backend for scenes and actions, runs the detection pipeline, and emits events.
- Scene configuration (camera URL, red zones, prompts, actions) is the single source of truth in the backend database.

See `architecture/` for detailed docs:

- `architecture/README.md` — system overview and data flow
- `architecture/deployment.md` — deployment runbook and version matrix
- `architecture/ROADMAP.md` — current state and future work

## Requirements

- Raspberry Pi 5 or generic aarch64 Debian/Ubuntu machine
- Hailo-10H or Hailo-8 accelerator with HailoRT installed
- Python 3.13+
- Node.js 20 LTS
- Hailo SDK:
  - `hailort`
  - `hailort-pcie-driver`
  - `hailo_platform` Python package

The installer checks for the Hailo SDK and, if missing, prints a link to the Hailo developer downloads page so you can install the correct version for your device.

## Installation

On the target device, run as root:

```bash
git clone https://github.com/PGielniak/catyolo.git /opt/catyolo
chmod +x /opt/catyolo/deploy/install.sh
sudo /opt/catyolo/deploy/install.sh
```

The installer is interactive by default. For a headless install that accepts all defaults:

```bash
sudo /opt/catyolo/deploy/install.sh --yes
```

This will:

1. Check architecture and install system dependencies.
2. Install `uv` and Node.js if they are missing.
3. Verify the Hailo SDK and detect your chip.
4. Create the `catyolo` system user and standard directories.
5. Install Python and Node dependencies and build the frontend.
6. Download the correct HEF set for your chip.
7. Generate `.env` files in `/etc/catyolo/` and create an API key.
8. Install, enable, and start the systemd units.
9. Print an exit report.

Filesystem layout after install:

```
/opt/catyolo/              # repository checkout
/etc/catyolo/              # .env configuration files
/var/lib/catyolo/          # database, samples, red zones
/usr/share/catyolo/hefs/   # HEF model files
/var/log/catyolo/          # log files
```

## First camera setup

1. Open the frontend at `http://<pi-ip>:3100`.
2. Log in with the API key shown at the end of the installer (stored in `/etc/catyolo/worker.env`).
3. Create a scene:
   - Enter the camera IP, port, username, and password.
   - Grab a reference frame.
   - Draw one or more red zones on the frame.
   - Set forbidden classes (e.g., `cat`, `person`) and optional VLM prompts.
   - Attach actions (Telegram, webhook, SMB).
4. Save the scene. The worker will detect the configuration change and start the pipeline automatically.

## Upgrade

To pull the latest code, rebuild, and restart services without re-running the full infrastructure setup:

```bash
sudo /opt/catyolo/deploy/install.sh --upgrade
```

## Operations

Check service status:

```bash
systemctl status catyolo-backend catyolo-worker catyolo-frontend
```

View logs:

```bash
journalctl -u catyolo-backend -f
journalctl -u catyolo-worker -f
journalctl -u catyolo-frontend -f
```

Restart all services:

```bash
systemctl restart catyolo-backend catyolo-worker catyolo-frontend
```

Health checks:

```bash
curl http://127.0.0.1:8100/healthz
curl http://127.0.0.1:5001/healthz
```

## HEF assets

HEFs are too large for git. The installer downloads them from the URLs listed in `deploy/hefs/manifest-{arch}.yaml`. By default these point to a public S3 bucket:

```
https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/{arch}/{filename}
```

Manifests contain filenames, URLs, and SHA256 checksums. The installer downloads missing HEFs, resumes partial downloads, and verifies their checksums.

> Hailo-8 HEFs are not yet bundled. To add support, place `hailo8/yolov8s.hef` in the bucket and update `deploy/hefs/manifest-hailo8.yaml`.

## Development

Run services manually for development:

```bash
# Backend
cd catyolo_ai_backend
uv run python main.py

# Worker
cd catyolo_ai_worker
uv run python -m detector.main

# Frontend
cd catyolo_ai_frontend
npm ci
npm run dev
```

## License

MIT
