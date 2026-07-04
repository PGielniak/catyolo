#!/usr/bin/env bash
# CatYolo one-command deployment installer.
# Run as root on a fresh Raspberry Pi / Debian / Ubuntu aarch64 system.
#
# Usage:
#   sudo /opt/catyolo/deploy/install.sh           # interactive install
#   sudo /opt/catyolo/deploy/install.sh --yes     # non-interactive, defaults only
#   sudo /opt/catyolo/deploy/install.sh --upgrade # pull, rebuild, restart only

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_REPO_INSTALL_DIR="/opt/catyolo"
DEFAULT_CONFIG_DIR="/etc/catyolo"
DEFAULT_DATA_DIR="/var/lib/catyolo"
DEFAULT_HEF_DIR="/usr/share/catyolo/hefs"
DEFAULT_LOG_DIR="/var/log/catyolo"
DEFAULT_USER="catyolo"
DEFAULT_GROUP="catyolo"

DEFAULT_BACKEND_HOST="0.0.0.0"
DEFAULT_BACKEND_PORT="8100"
DEFAULT_FRONTEND_PORT="3100"
DEFAULT_WORKER_STREAM_PORT="5001"
DEFAULT_MAX_SCENES="3"
DEFAULT_TARGET_FPS="15"
DEFAULT_YOLO_CONFIDENCE_THRESHOLD="0.4"
DEFAULT_CORS_ORIGINS="http://localhost:3100"
DEFAULT_ENABLE_STREAM="true"
DEFAULT_ENABLE_SAMPLE_SAVER="false"
DEFAULT_SKIP_AUTH="false"
DEFAULT_LOG_LEVEL="INFO"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
print_usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --yes, -y          Non-interactive mode: accept all defaults
  --upgrade          Pull latest code, rebuild, and restart services only
  --help, -h         Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)
            YES_MODE=true
            shift
            ;;
        --upgrade)
            UPGRADE_MODE=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            error "Unknown argument: $1"
            print_usage
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Upgrade path
# ---------------------------------------------------------------------------
do_upgrade() {
    info "Upgrade mode: skipping infrastructure setup."

    if [[ ! -d "$DEFAULT_REPO_INSTALL_DIR/.git" ]]; then
        error "No git checkout found at $DEFAULT_REPO_INSTALL_DIR; cannot upgrade."
        exit 1
    fi

    info "Pulling latest code..."
    git -C "$DEFAULT_REPO_INSTALL_DIR" pull
    report_installed "git pull origin $(git -C "$DEFAULT_REPO_INSTALL_DIR" rev-parse --abbrev-ref HEAD)"

    install_python_deps
    install_frontend_deps

    info "Restarting services..."
    systemctl daemon-reload
    systemctl restart catyolo-backend catyolo-worker catyolo-frontend

    report_installed "services restarted (backend, worker, frontend)"
    verify_services
    print_report
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
preflight() {
    info "CatYolo installer starting..."
    require_root

    local arch distro
    arch=$(detect_arch)
    distro=$(detect_distro)

    info "Detected architecture: $arch"
    info "Detected distro: $distro"

    if [[ "$arch" != "aarch64" ]]; then
        warn "CatYolo is designed for aarch64 (Raspberry Pi 5). Detected: $arch"
        if ! prompt_yn "Continue anyway?" n; then
            exit 1
        fi
    fi

    case "$distro" in
        debian|ubuntu|raspbian) ;;
        *)
            warn "Unsupported distro: $distro. Install may not work."
            if ! prompt_yn "Continue anyway?" n; then
                exit 1
            fi
            ;;
    esac

    report_installed "distro=$distro arch=$arch"
}

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------
install_system_packages() {
    info "Installing system dependencies..."
    apt-get update -qq

    local packages=(
        git
        curl
        wget
        ca-certificates
        gnupg
        gettext-base
        python3
        python3-venv
        python3-pip
        python3-yaml
        libgl1
        libglib2.0-0
        libsm6
        libxext6
        libxrender-dev
        libgomp1
    )

    # Pi camera / video group support when available
    if apt-cache show libcamera-dev >/dev/null 2>&1; then
        packages+=(libcamera-dev)
    fi

    apt-get install -y -qq "${packages[@]}"
    report_installed "system packages"
}

# ---------------------------------------------------------------------------
# Tooling: uv, Node.js
# ---------------------------------------------------------------------------
ensure_tooling() {
    info "Checking Python..."
    if ! python_version_ok; then
        error "Python 3.13+ is required. Found: $(python3 --version 2>&1)"
        exit 1
    fi
    report_installed "Python $(python3 --version 2>&1 | cut -d' ' -f2)"

    info "Checking uv..."
    install_uv

    info "Checking Node.js..."
    install_node
}

# ---------------------------------------------------------------------------
# Hailo check
# ---------------------------------------------------------------------------
check_hailo() {
    info "Checking Hailo SDK..."

    if ! check_hailo_sdk; then
        print_hailo_missing_instructions
        report_missing "Hailo SDK (hailort + hailo_platform)"
        print_report
        exit 1
    fi

    detect_hailo_chip
    info "Hailo SDK found: $HAILO_VERSION"
    info "Detected Hailo chip: $HAILO_CHIP"
    report_installed "Hailo SDK ($HAILO_VERSION, chip=$HAILO_CHIP)"
}

# ---------------------------------------------------------------------------
# CatYolo user and filesystem layout
# ---------------------------------------------------------------------------
CATYOLO_USER=""
CATYOLO_GROUP=""
REPO_INSTALL_DIR=""
CONFIG_DIR=""
DATA_DIR=""
HEF_DIR=""
LOG_DIR=""

create_user_and_dirs() {
    CATYOLO_USER=$(prompt "CatYolo system user" "$DEFAULT_USER")
    CATYOLO_GROUP=$(prompt "CatYolo system group" "$DEFAULT_GROUP")
    REPO_INSTALL_DIR=$(prompt "Repository install directory" "$DEFAULT_REPO_INSTALL_DIR")
    CONFIG_DIR=$(prompt "Config directory" "$DEFAULT_CONFIG_DIR")
    DATA_DIR=$(prompt "Data directory" "$DEFAULT_DATA_DIR")
    HEF_DIR=$(prompt "HEF models directory" "$DEFAULT_HEF_DIR")
    LOG_DIR=$(prompt "Log directory" "$DEFAULT_LOG_DIR")

    # Export for templating
    export CATYOLO_USER CATYOLO_GROUP REPO_INSTALL_DIR CONFIG_DIR DATA_DIR HEF_DIR LOG_DIR

    if ! getent group "$CATYOLO_GROUP" >/dev/null 2>&1; then
        info "Creating group $CATYOLO_GROUP..."
        groupadd --system "$CATYOLO_GROUP"
    fi

    if ! id -u "$CATYOLO_USER" >/dev/null 2>&1; then
        info "Creating user $CATYOLO_USER..."
        useradd --system --home-dir "$DATA_DIR" --create-home \
            --shell /usr/sbin/nologin --gid "$CATYOLO_GROUP" "$CATYOLO_USER"
        report_installed "user $CATYOLO_USER"
    else
        report_installed "user $CATYOLO_USER (already exists)"
    fi

    usermod -aG video,render,plugdev "$CATYOLO_USER" 2>/dev/null || \
        warn "Could not add $CATYOLO_USER to all hardware groups"

    ensure_dir "$REPO_INSTALL_DIR" root root
    ensure_dir "$CONFIG_DIR" "$CATYOLO_USER" "$CATYOLO_GROUP"
    ensure_dir "$DATA_DIR" "$CATYOLO_USER" "$CATYOLO_GROUP"
    ensure_dir "$HEF_DIR" "$CATYOLO_USER" "$CATYOLO_GROUP"
    ensure_dir "$LOG_DIR" "$CATYOLO_USER" "$CATYOLO_GROUP"
    ensure_dir "$DATA_DIR/samples" "$CATYOLO_USER" "$CATYOLO_GROUP"
    ensure_dir "$DATA_DIR/red_zones" "$CATYOLO_USER" "$CATYOLO_GROUP"

    report_installed "directories ($CONFIG_DIR, $DATA_DIR, $HEF_DIR, $LOG_DIR)"
}

# ---------------------------------------------------------------------------
# Clone / copy repo
# ---------------------------------------------------------------------------
clone_repo() {
    info "Setting up CatYolo repository..."

    if [[ -d "$REPO_INSTALL_DIR/.git" ]]; then
        info "Repository already exists at $REPO_INSTALL_DIR; pulling latest..."
        git -C "$REPO_INSTALL_DIR" pull
    else
        info "Cloning https://github.com/PGielniak/catyolo.git ..."
        git clone https://github.com/PGielniak/catyolo.git "$REPO_INSTALL_DIR"
    fi

    chown -R "$CATYOLO_USER:$CATYOLO_GROUP" "$REPO_INSTALL_DIR"
    report_installed "repository at $REPO_INSTALL_DIR"
}

# ---------------------------------------------------------------------------
# HEF helpers
# ---------------------------------------------------------------------------
# Compares a file's SHA256 to an expected value.
# Prints: "ok" | "bad" | "none" (no expected checksum provided)
check_hef_sha256() {
    local file=$1
    local expected=$2
    if [[ -z "$expected" || "$expected" == "REPLACE_WITH_SHA256" ]]; then
        echo "none"
        return
    fi
    local computed
    computed=$(sha256sum "$file" | awk '{print $1}')
    if [[ "$computed" == "$expected" ]]; then
        echo "ok"
    else
        echo "bad"
    fi
}

# ---------------------------------------------------------------------------
# HEF download / verification
# ---------------------------------------------------------------------------
setup_hefs() {
    info "Setting up HEFs for $HAILO_CHIP..."

    local arch_dir="$HEF_DIR/$HAILO_CHIP"
    ensure_dir "$arch_dir" "$CATYOLO_USER" "$CATYOLO_GROUP"

    local manifest_src="$REPO_INSTALL_DIR/deploy/hefs/manifest-${HAILO_CHIP}.yaml"
    local manifest_dst="$arch_dir/manifest.yaml"

    if [[ ! -f "$manifest_src" ]]; then
        error "HEF manifest not found: $manifest_src"
        exit 1
    fi

    cp "$manifest_src" "$manifest_dst"
    chown "$CATYOLO_USER:$CATYOLO_GROUP" "$manifest_dst"

    # Parse manifest and fetch missing HEFs
    local entries
    entries=$(python3 - <<PY
import yaml
with open("$manifest_dst") as f:
    data = yaml.safe_load(f) or {}
for key, entry in data.items():
    if isinstance(entry, dict) and "url" in entry:
        print(f"{key}|{entry.get('path')}|{entry.get('url')}|{entry.get('sha256', '')}")
PY
    )

    local downloaded=0
    local existing=0

    while IFS='|' read -r key path url sha; do
        [[ -z "$key" ]] && continue
        local dest="$arch_dir/$path"

        if [[ -f "$dest" ]]; then
            local status
            status=$(check_hef_sha256 "$dest" "$sha")
            if [[ "$status" == "ok" ]]; then
                info "HEF already present and verified: $path"
                existing=$((existing + 1))
                continue
            elif [[ "$status" == "bad" ]]; then
                warn "HEF exists but checksum mismatch for $path; re-downloading..."
                rm -f "$dest"
            else
                info "HEF already present (no checksum): $path"
                existing=$((existing + 1))
                continue
            fi
        fi

        info "Downloading HEF: $path ..."
        if [[ -t 1 ]]; then
            curl -fsSL -C - --progress-bar -o "$dest" "$url"
        else
            curl -fsSL -C - -o "$dest" "$url"
        fi
        chown "$CATYOLO_USER:$CATYOLO_GROUP" "$dest"
        downloaded=$((downloaded + 1))

        local status
        status=$(check_hef_sha256 "$dest" "$sha")
        if [[ "$status" == "ok" ]]; then
            info "SHA256 verified: $path"
        elif [[ "$status" == "bad" ]]; then
            error "SHA256 mismatch for $path: expected $sha"
            exit 1
        else
            warn "No SHA256 recorded for $path; skipping checksum verification"
        fi
    done <<< "$entries"

    report_installed "HEFs ($existing existing, $downloaded downloaded)"
}

# ---------------------------------------------------------------------------
# Python / Node dependencies
# ---------------------------------------------------------------------------
link_hailo_sdk_into_worker_venv() {
    info "Linking Hailo SDK into worker venv..."

    local venv_site_packages
    venv_site_packages=$(find "$REPO_INSTALL_DIR/catyolo_ai_worker/.venv/lib" -name site-packages -type d | head -n1)

    if [[ -z "$venv_site_packages" || ! -d "$venv_site_packages" ]]; then
        warn "Worker venv site-packages not found; skipping Hailo SDK link"
        return
    fi

    # Find where Hailo packages live in system Python
    local system_pkg_dir
    system_pkg_dir=$(python3 - <<PY
import sys, os
for p in sys.path:
    platform_path = os.path.join(p, 'hailo_platform')
    if os.path.isdir(platform_path) or os.path.isfile(platform_path):
        print(p)
        break
PY
    )

    if [[ -z "$system_pkg_dir" ]]; then
        warn "Could not find hailo_platform in system Python path"
        return
    fi

    info "Found Hailo SDK packages at $system_pkg_dir"

    # Symlink every hailo* package/file into the venv so the isolated
    # environment can import Hailo without pulling in the system's older
    # dependencies (e.g. typing_extensions).
    local linked=0
    for pkg in "$system_pkg_dir"/hailo*; do
        [[ -e "$pkg" ]] || continue
        local basename
        basename=$(basename "$pkg")
        local target="$venv_site_packages/$basename"

        if [[ -e "$target" || -L "$target" ]]; then
            rm -rf "$target"
        fi
        ln -s "$pkg" "$target"
        linked=$((linked + 1))
    done

    report_installed "Hailo SDK linked into worker venv ($linked packages)"
}

install_python_deps() {
    info "Installing backend Python dependencies..."
    uv sync --project "$REPO_INSTALL_DIR/catyolo_ai_backend"
    report_installed "backend Python dependencies"

    info "Installing worker Python dependencies..."
    uv sync --project "$REPO_INSTALL_DIR/catyolo_ai_worker"
    report_installed "worker Python dependencies"

    link_hailo_sdk_into_worker_venv
}

install_frontend_deps() {
    info "Installing frontend dependencies and building..."
    (
        cd "$REPO_INSTALL_DIR/catyolo_ai_frontend"
        npm ci
        npm run build
    )
    # npm runs as root during install, so the dist folder ends up root-owned.
    # The frontend service needs to write runtime config.json here.
    chown -R "$CATYOLO_USER:$CATYOLO_GROUP" "$REPO_INSTALL_DIR/catyolo_ai_frontend/dist"
    report_installed "frontend built"
}

install_dependencies() {
    install_python_deps
    install_frontend_deps
}

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------
BACKEND_HOST=""
BACKEND_PORT=""
FRONTEND_PORT=""
WORKER_STREAM_PORT=""
API_KEY_SALT=""
API_KEY=""
SKIP_AUTH=""

configure_env() {
    info "Configuring environment files..."

    BACKEND_HOST=$(prompt "Backend bind host" "$DEFAULT_BACKEND_HOST")
    BACKEND_PORT=$(prompt "Backend port" "$DEFAULT_BACKEND_PORT")
    FRONTEND_PORT=$(prompt "Frontend port" "$DEFAULT_FRONTEND_PORT")
    WORKER_STREAM_PORT=$(prompt "Worker debug stream port" "$DEFAULT_WORKER_STREAM_PORT")
    local max_scenes
    max_scenes=$(prompt "Max scenes (cameras)" "$DEFAULT_MAX_SCENES")
    local target_fps
    target_fps=$(prompt "Per-scene target FPS" "$DEFAULT_TARGET_FPS")
    local yolo_conf
    yolo_conf=$(prompt "YOLO confidence threshold" "$DEFAULT_YOLO_CONFIDENCE_THRESHOLD")
    local cors_origins
    cors_origins=$(prompt "CORS allowed origins" "$DEFAULT_CORS_ORIGINS")

    if prompt_yn "Enable worker debug stream?" y; then
        ENABLE_STREAM="true"
    else
        ENABLE_STREAM="false"
    fi

    if prompt_yn "Enable sample saver?" n; then
        ENABLE_SAMPLE_SAVER="true"
    else
        ENABLE_SAMPLE_SAVER="false"
    fi

    if prompt_yn "Skip API key auth in frontend and backend (SKIP_AUTH)?" n; then
        SKIP_AUTH="true"
    else
        SKIP_AUTH="false"
    fi

    # Generate random salt if not already present in existing backend.env
    if [[ -f "$CONFIG_DIR/backend.env" ]] && grep -q "^API_KEY_SALT=" "$CONFIG_DIR/backend.env"; then
        API_KEY_SALT=$(grep "^API_KEY_SALT=" "$CONFIG_DIR/backend.env" | cut -d= -f2-)
        info "Reusing existing API_KEY_SALT from $CONFIG_DIR/backend.env"
    else
        API_KEY_SALT=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    fi

    # Export all variables needed by templates
    export BACKEND_HOST BACKEND_PORT FRONTEND_PORT WORKER_STREAM_PORT
    export MAX_SCENES="$max_scenes"
    export TARGET_FPS="$target_fps"
    export YOLO_CONFIDENCE_THRESHOLD="$yolo_conf"
    export CORS_ALLOWED_ORIGINS="$cors_origins"
    export ENABLE_STREAM ENABLE_SAMPLE_SAVER SKIP_AUTH
    export LOG_LEVEL="$DEFAULT_LOG_LEVEL"
    export API_KEY_SALT

    export DATABASE_PATH="$DATA_DIR/catyolo.db"
    export LOG_FILE_PATH="$LOG_DIR/catyolo.log"
    export CAMERA_USERNAME=""
    export CAMERA_PASSWORD=""

    export HAILO_ARCH="$HAILO_CHIP"
    export HEF_DIR="$HEF_DIR"
    export EXIT_ON_NO_HAILO="true"
    export HAILO8_MAX_STREAMS="1"
    export HAILORT_LOGGER_PATH="$DATA_DIR/logs/hailort.log"
    export SAMPLES_DIR="$DATA_DIR/samples"
    export CONFIG_POLL_INTERVAL="2.0"
    export ACTIONS_POLL_INTERVAL="2.0"

    export FRONTEND_DIST="$REPO_INSTALL_DIR/catyolo_ai_frontend/dist"
    export API_BASE="http://127.0.0.1:${BACKEND_PORT}"

    # Render templates
    render_template "$REPO_INSTALL_DIR/deploy/templates/backend.env.j2" "$CONFIG_DIR/backend.env"
    render_template "$REPO_INSTALL_DIR/deploy/templates/worker.env.j2" "$CONFIG_DIR/worker.env"
    render_template "$REPO_INSTALL_DIR/deploy/templates/frontend.env.j2" "$CONFIG_DIR/frontend.env"

    chown "$CATYOLO_USER:$CATYOLO_GROUP" "$CONFIG_DIR"/*.env
    chmod 640 "$CONFIG_DIR"/*.env

    report_installed "environment files in $CONFIG_DIR"

    # Create API key
    info "Creating API key for worker..."
    ensure_dir "$DATA_DIR/logs" "$CATYOLO_USER" "$CATYOLO_GROUP"

    API_KEY=$(
        cd "$REPO_INSTALL_DIR/catyolo_ai_backend"
        DATABASE_PATH="$DATABASE_PATH" API_KEY_SALT="$API_KEY_SALT" LOG_FILE_PATH="$LOG_FILE_PATH" \
        uv run python scripts/create_api_key.py worker \
        | sed -n 's/^[[:space:]]*\([A-Za-z0-9_-]\+\)[[:space:]]*$/\1/p' | head -n1
    )

    if [[ -z "$API_KEY" ]]; then
        error "Failed to create API key. Check backend logs."
        exit 1
    fi

    # Inject API key into worker.env
    sed -i "s|^API_KEY=.*|API_KEY=$API_KEY|" "$CONFIG_DIR/worker.env"
    chown "$CATYOLO_USER:$CATYOLO_GROUP" "$CONFIG_DIR/worker.env"
    chmod 640 "$CONFIG_DIR/worker.env"

    report_installed "API key for worker"
    info "API key created. It is stored in $CONFIG_DIR/worker.env"
}

# ---------------------------------------------------------------------------
# systemd
# ---------------------------------------------------------------------------
install_systemd_units() {
    info "Installing systemd units..."

    render_template "$REPO_INSTALL_DIR/deploy/systemd/catyolo-backend.service" \
        "/etc/systemd/system/catyolo-backend.service"
    render_template "$REPO_INSTALL_DIR/deploy/systemd/catyolo-worker.service" \
        "/etc/systemd/system/catyolo-worker.service"
    render_template "$REPO_INSTALL_DIR/deploy/systemd/catyolo-frontend.service" \
        "/etc/systemd/system/catyolo-frontend.service"

    chmod 644 /etc/systemd/system/catyolo-*.service

    systemctl daemon-reload
    systemctl enable catyolo-backend catyolo-worker catyolo-frontend
    systemctl restart catyolo-backend catyolo-worker catyolo-frontend

    report_installed "systemd units enabled and started"
}

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
verify_services() {
    info "Verifying services..."
    sleep 3

    local ip
    ip=$(hostname -I | awk '{print $1}')

    local services=(catyolo-backend catyolo-worker catyolo-frontend)
    for svc in "${services[@]}"; do
        if systemctl is-active --quiet "$svc"; then
            report_installed "$svc is active"
        else
            report_missing "$svc is NOT active"
            report_warning "Run: journalctl -u $svc -n 50 --no-pager"
        fi
    done

    if curl -fsS "http://127.0.0.1:${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}/healthz" >/dev/null 2>&1; then
        report_installed "backend /healthz reachable"
    else
        report_missing "backend /healthz not reachable"
    fi

    if curl -fsS "http://127.0.0.1:${WORKER_STREAM_PORT:-$DEFAULT_WORKER_STREAM_PORT}/healthz" >/dev/null 2>&1; then
        report_installed "worker /healthz reachable"
    else
        report_missing "worker /healthz not reachable"
    fi
}

# ---------------------------------------------------------------------------
# Access summary
# ---------------------------------------------------------------------------
print_access_summary() {
    local ip host
    ip=$(hostname -I | awk '{print $1}')
    host=$(hostname)

    local backend_port="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
    local frontend_port="${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"
    local worker_port="${WORKER_STREAM_PORT:-$DEFAULT_WORKER_STREAM_PORT}"

    echo
    echo "==============================================================================="
    echo "                          CatYolo access URLs"
    echo "==============================================================================="
    echo
    echo "  Hostname : $host"
    echo "  IP       : $ip"
    echo
    echo "  Frontend        : http://${host}:${frontend_port}"
    echo "                    http://${ip}:${frontend_port}"
    echo "  Backend API     : http://${ip}:${backend_port}"
    echo "  Backend health  : http://${ip}:${backend_port}/healthz"
    echo "  Worker stream   : http://${ip}:${worker_port}"
    echo "  Worker health   : http://${ip}:${worker_port}/healthz"
    echo
    echo "==============================================================================="
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    if [[ "$UPGRADE_MODE" == true ]]; then
        do_upgrade
        return 0
    fi

    preflight
    install_system_packages
    ensure_tooling
    check_hailo
    create_user_and_dirs
    clone_repo
    setup_hefs
    install_dependencies
    configure_env
    install_systemd_units
    verify_services
    print_report
    print_access_summary
}

main "$@"
