#!/usr/bin/env bash
# Common helpers for the CatYolo deployment scripts.
# shellcheck shell=bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Globals / state
# ---------------------------------------------------------------------------
REPORT_INSTALLED=()
REPORT_MISSING=()
REPORT_WARNINGS=()

YES_MODE=${YES_MODE:-false}
UPGRADE_MODE=${UPGRADE_MODE:-false}

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
info() { printf '\033[1;34m[ INFO ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ WARN ]\033[0m %s\n' "$*" >&2; }
error() { printf '\033[1;31m[ ERROR ]\033[0m %s\n' "$*" >&2; }
success() { printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"; }

log() {
    local level=$1
    shift
    case "$level" in
        info) info "$@" ;;
        warn) warn "$@" ;;
        error) error "$@" ;;
        success) success "$@" ;;
    esac
}

# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------
prompt() {
    local prompt_text=$1
    local default=$2
    local value

    if [[ "$YES_MODE" == true ]]; then
        echo "$default"
        return 0
    fi

    read -rp "${prompt_text} [${default}]: " value
    echo "${value:-$default}"
}

prompt_yn() {
    local prompt_text=$1
    local default=${2:-y}
    local value

    if [[ "$YES_MODE" == true ]]; then
        [[ "$default" == [Yy]* ]] && return 0 || return 1
    fi

    local suffix
    if [[ "$default" == [Yy]* ]]; then
        suffix="[Y/n]"
    else
        suffix="[y/N]"
    fi

    read -rp "${prompt_text} ${suffix}: " value
    value=${value:-$default}
    [[ "$value" == [Yy]* ]]
}

# ---------------------------------------------------------------------------
# Report tracking
# ---------------------------------------------------------------------------
report_installed() { REPORT_INSTALLED+=("$*"); }
report_missing() { REPORT_MISSING+=("$*"); }
report_warning() { REPORT_WARNINGS+=("$*"); }

print_report() {
    echo
    echo "==============================================================================="
    echo "                         CatYolo deployment report"
    echo "==============================================================================="
    echo

    if [[ ${#REPORT_INSTALLED[@]} -gt 0 ]]; then
        echo "Installed / configured:"
        for item in "${REPORT_INSTALLED[@]}"; do
            echo "  - $item"
        done
        echo
    fi

    if [[ ${#REPORT_MISSING[@]} -gt 0 ]]; then
        echo "Missing / not configured:"
        for item in "${REPORT_MISSING[@]}"; do
            echo "  - $item"
        done
        echo
    fi

    if [[ ${#REPORT_WARNINGS[@]} -gt 0 ]]; then
        echo "Warnings:"
        for item in "${REPORT_WARNINGS[@]}"; do
            echo "  - $item"
        done
        echo
    fi

    echo "==============================================================================="
}

# ---------------------------------------------------------------------------
# System / distro detection
# ---------------------------------------------------------------------------
detect_distro() {
    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        echo "${ID:-unknown}"
    else
        echo "unknown"
    fi
}

detect_arch() {
    uname -m
}

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        error "This script must be run as root (e.g. with sudo)."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Command availability
# ---------------------------------------------------------------------------
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Python / uv / Node helpers
# ---------------------------------------------------------------------------
python_version_ok() {
    local version
    version=$(python3 --version 2>&1 | awk '{print $2}')
    local major minor
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)

    if [[ "$major" -gt 3 ]] || { [[ "$major" -eq 3 ]] && [[ "$minor" -ge 13 ]]; }; then
        return 0
    fi
    return 1
}

install_uv() {
    if command_exists uv; then
        info "uv already installed: $(uv --version)"
        return 0
    fi

    info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Ensure uv is on PATH for the rest of this script
    export PATH="$HOME/.local/bin:$PATH"
    if ! command_exists uv; then
        if [[ -f "$HOME/.local/bin/env" ]]; then
            # shellcheck source=/dev/null
            . "$HOME/.local/bin/env"
        fi
    fi

    if ! command_exists uv; then
        error "uv installation failed or is not on PATH."
        exit 1
    fi
    report_installed "uv $(uv --version)"
}

install_node() {
    if command_exists node && command_exists npm; then
        info "Node.js already installed: $(node --version), npm $(npm --version)"
        return 0
    fi

    info "Installing Node.js LTS..."
    local distro
    distro=$(detect_distro)

    case "$distro" in
        debian|ubuntu|raspbian)
            if ! command_exists curl; then
                apt-get update -qq
                apt-get install -y -qq curl ca-certificates gnupg
            fi
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
                | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
                > /etc/apt/sources.list.d/nodesource.list
            apt-get update -qq
            apt-get install -y -qq nodejs
            ;;
        *)
            error "Unsupported distro for automatic Node.js install: $distro"
            exit 1
            ;;
    esac

    if ! command_exists node || ! command_exists npm; then
        error "Node.js installation failed."
        exit 1
    fi
    report_installed "Node.js $(node --version), npm $(npm --version)"
}

# ---------------------------------------------------------------------------
# Hailo helpers
# ---------------------------------------------------------------------------
HAILO_CHIP=""
HAILO_VERSION=""
HAILO_FW_VERSION=""

# HailoRT version required on Hailo-10H for the Qwen3-VLM (genai) stack.
# Older firmwares (e.g. 5.1.1 shipped by the raspberrypi apt repo's
# hailo-h10-all metapackage) load YOLO/depth fine but refuse to create the
# VLM with HAILO_INVALID_OPERATION(6) — "Failed to create VLM".
HAILO10H_REQUIRED_VERSION="5.3.0"
# Bucket path hosting HailoRT 5.3.0 packages for aarch64 (same bucket as the
# HEFs — see deploy/hefs/manifest-hailo10h.yaml for the bucket base URL).
HAILO_S3_BASE="https://catyolo-hef-bucket.s3.eu-central-1.amazonaws.com/hailort-5-3-0"
HAILO_S3_FILES=(
    "hailort-pcie-driver_5.3.0_all.deb"
    "hailort_5.3.0_arm64.deb"
    "hailo_gen_ai_model_zoo_5.3.0_arm64.deb"
    "hailort-5.3.0-cp313-cp313-linux_aarch64.whl"
)

check_hailo_sdk() {
    if ! command_exists hailortcli; then
        return 1
    fi

    if ! python3 -c "import hailo_platform" >/dev/null 2>&1; then
        return 1
    fi

    return 0
}

detect_hailo_chip() {
    HAILO_VERSION=$(hailortcli --version 2>&1 | head -n1 || true)

    local identify_output
    identify_output=$(hailortcli fw-control identify 2>&1 || true)

    # Parse "Firmware Version: 5.1.1 (release,app)" → "5.1.1"
    HAILO_FW_VERSION=$(echo "$identify_output" \
        | grep -iE "Firmware Version:" | head -n1 \
        | sed -E 's/.*[Vv]ersion:[[:space:]]*([0-9.]+).*/\1/' | tr -d '[:space:]' || true)

    if echo "$identify_output" | grep -qiE "hailo[-_]?10h"; then
        HAILO_CHIP="hailo10h"
    elif echo "$identify_output" | grep -qiE "hailo[-_]?8"; then
        HAILO_CHIP="hailo8"
    else
        HAILO_CHIP="unknown"
    fi
}

# Returns 0 if $1 < $2 (semantic version compare via sort -V).
hailo_version_lt() {
    [[ -n "$1" && -n "$2" && "$1" != "$2" ]] || return 1
    [[ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" == "$1" ]]
}

print_hailo_missing_instructions() {
    echo
    warn "Hailo SDK not found on this system."
    info "CatYolo requires HailoRT $HAILO10H_REQUIRED_VERSION+ on Hailo-10H for"
    info "the Qwen3-VLM (VLM creation fails with HAILO_INVALID_OPERATION(6)"
    info "on older firmwares). The raspberrypi apt metapackage 'hailo-h10-all'"
    info "only ships 5.1.1 — DO NOT use it."
    info ""
    info "To bootstrap, install DKMS (kernel module builder) first:"
    info "  sudo apt install dkms"
    info ""
    info "Then download and install HailoRT 5.3.0 from the CatYolo S3 bucket."
    info "Copy-paste these commands:"
    echo
    local f
    for f in "${HAILO_S3_FILES[@]}"; do
        echo "  curl -fSLO $HAILO_S3_BASE/$f"
    done
    info ""
    info "Install order: .deb files first, then the .whl:"
    info "  sudo dpkg -i hailort-pcie-driver_5.3.0_all.deb \\"
    info "                hailort_5.3.0_arm64.deb \\"
    info "                hailo_gen_ai_model_zoo_5.3.0_arm64.deb"
    info "  sudo apt-get install -y -f"
    info "  sudo pip3 install --break-system-packages hailort-5.3.0-cp313-cp313-linux_aarch64.whl"
    info ""
    info "Or — once 'hailortcli' is available from any source — re-run this"
    info "installer; it will auto-upgrade to 5.3.0 from the S3 bucket if the"
    info "running firmware is older, then prompt you to reboot."
    info "After a reboot, re-run this installer to continue CatYolo setup."
    echo
}

# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------
ensure_dir() {
    local dir=$1
    local owner=${2:-}
    local group=${3:-}

    mkdir -p "$dir"
    if [[ -n "$owner" ]]; then
        chown "$owner${group:+:$group}" "$dir"
    fi
}

# ---------------------------------------------------------------------------
# Templating helper (envsubst-style).
# Variables must be exported before calling.
# Falls back to a Python implementation if envsubst is unavailable.
# ---------------------------------------------------------------------------
render_template() {
    local template=$1
    local output=$2
    local tmp
    tmp=$(mktemp)

    if command_exists envsubst; then
        envsubst < "$template" > "$tmp"
    else
        python3 - <<PY
import os, string, sys
with open("$template") as f:
    tmpl = f.read()
with open("$tmp", "w") as f:
    f.write(string.Template(tmpl).substitute(os.environ))
PY
    fi

    mv "$tmp" "$output"
}
