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

- Raspberry Pi 5 
- Hailo 10H (AI Hat 2+) - Hailo8 will also be supported soon though without VLM capabilities


##  Installing prerequisites

Walk through the following steps manually on the target device - you'll have to reboot twice, that's why it's not included in the automatic script.

> **Important:** The `hailo-h10-all` metapackage from the Raspberry Pi apt repo pins HailoRT to **5.1.1**, which loads YOLO + depth fine but fails to create the Qwen3 VLM with `HAILO_INVALID_OPERATION(6) — "Failed to create VLM"`. CatYolo's VLM needs HailoRT **5.3.0+**, which the installer below downloads from the CatYolo S3 bucket automatically. Do **not** run `apt install hailo-h10-all` — it will roll you back to 5.1.1.

```bash

# Step 1 — Add Hailo apt repository (needed for dkms, kernel headers, build deps)
sudo tee /etc/apt/sources.list.d/hailo.sources <<EOF
Types: deb
URIs: https://hailo:chahy5Zo@extranet.raspberrypi.org/hailo
Suites: trixie
Components: main
Signed-By: /usr/share/keyrings/raspberrypi-archive-keyring.gpg
EOF

sudo apt update && sudo apt full-upgrade -y && sudo reboot

# Step 2 — Install DKMS (the HailoRT PCIe driver .deb uses DKMS to build
# the kernel module). DO NOT install hailo-h10-all — it pins 5.1.1.
sudo apt install dkms

# Step 3 — Bootstrap HailoRT 5.3.0 manually, OR let the CatYolo installer
# handle it. To bootstrap manually (fresh Pi with no hailortcli yet):
curl -fSLO https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/hailort-5-3-0/hailort-pcie-driver_5.3.0_all.deb
curl -fSLO https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/hailort-5-3-0/hailort_5.3.0_arm64.deb
curl -fSLO https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/hailort-5-3-0/hailo_gen_ai_model_zoo_5.3.0_arm64.deb
curl -fSLO https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/hailort-5-3-0/hailort-5.3.0-cp313-cp313-linux_aarch64.whl

# Hailo's 5.3.0 driver calls del_timer_sync(), removed in Linux >= 6.15
# (renamed to timer_delete_sync). On a current Pi 5 kernel (6.18+) the
# package postinst fails mid-DKMS-build, so use --unpack + patch + --configure
# instead of plain `dpkg -i`. Skip the sed step on kernels < 6.15.
sudo dpkg --unpack hailort-pcie-driver_5.3.0_all.deb \
                  hailort_5.3.0_arm64.deb \
                  hailo_gen_ai_model_zoo_5.3.0_arm64.deb
if uname -r | awk -F. 'NR==1{exit !($1*1000+$2 >= 6015)}'; then
    sudo sed -i 's/\bdel_timer_sync\b/timer_delete_sync/g' \
        /usr/src/hailort-pcie-driver/linux/vdma/monitor.c \
        /usr/src/hailo1x_pci-5.3.0/linux/vdma/monitor.c
fi
sudo dpkg --configure -a
sudo apt-get install -y -f
sudo pip3 install --break-system-packages hailort-5.3.0-cp313-cp313-linux_aarch64.whl

sudo reboot

# After reboot, verify the firmware came up at 5.3.x (not just the CLI):
hailortcli fw-control identify
# Expected: Firmware Version: 5.3.0 (or later)

hailortcli scan
# Expected: [-] Device: 0001:01:00.0

```

If an older HailoRT (5.1.1) is already installed, just run the CatYolo installer below — it detects the firmware version, removes the conflicting 5.1.1 metapackages, and re-installs 5.3.0 from the S3 bucket automatically, then prompts for a reboot.


## Installation



On the target device, run as root:

```bash
sudo git clone https://github.com/PGielniak/catyolo.git /opt/catyolo
sudo chmod +x /opt/catyolo/deploy/install.sh
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

> Hailo-8 HEFs (YOLO + depth, no VLM) are bundled in the same S3 bucket under `hailo8/` and listed in `deploy/hefs/manifest-hailo8.yaml`. The installer downloads them automatically when a Hailo-8 chip is detected.

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
