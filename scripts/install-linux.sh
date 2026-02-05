#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer is for Linux only." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_USER="$(id -un)"
HOME_DIR="${HOME}"
DEFAULT_INSTALL_DIR="/opt/loong"
DEFAULT_PORT="17800"
DEFAULT_STATE_DIR="${HOME_DIR}/.loong"
DEFAULT_WEB_DIST="${DEFAULT_INSTALL_DIR}/apps/web/dist"
DEFAULT_OUTPUT_DIR="${HOME_DIR}/output"
DEFAULT_AUDIO_OUTPUT_DIR="${HOME_DIR}/output/audio-pipeline"
DEFAULT_SERVICE_NAME="loong"
DEFAULT_REBOOT_DELAY_MS="1000"

prompt() {
  local label="$1"
  local default="$2"
  local value
  read -r -p "${label} [${default}]: " value
  echo "${value:-${default}}"
}

prompt_optional() {
  local label="$1"
  local value
  read -r -p "${label} (optional): " value
  echo "${value}"
}

prompt_secret() {
  local label="$1"
  local value
  read -r -s -p "${label} (optional): " value
  echo
  echo "${value}"
}

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Please install pnpm first." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Please install Node.js >= 20." >&2
  exit 1
fi

INSTALL_DIR="$(prompt "Install directory" "${DEFAULT_INSTALL_DIR}")"
PORT="$(prompt "Port" "${DEFAULT_PORT}")"
STATE_DIR="$(prompt "State dir" "${DEFAULT_STATE_DIR}")"
SERVICE_NAME="$(prompt "systemd service name" "${DEFAULT_SERVICE_NAME}")"
REBOOT_DELAY_MS="$(prompt "Reboot delay (ms)" "${DEFAULT_REBOOT_DELAY_MS}")"
PASSWORD="$(prompt_secret "LOONG_PASSWORD")"

IMG_PIPELINE_DIR="$(prompt_optional "Image pipeline dir (leave blank to use built-in)")"
AUDIO_PIPELINE_DIR="$(prompt_optional "Audio pipeline dir (leave blank to use built-in)")"
IMG_INPUT_DIRS="$(prompt_optional "Image watch dirs (comma-separated, leave blank to disable)")"
AUDIO_INPUT_DIRS="$(prompt_optional "Audio watch dirs (comma-separated, leave blank to disable)")"
IMG_OUTPUT_DIR="$(prompt "Image output dir" "${DEFAULT_OUTPUT_DIR}")"
AUDIO_OUTPUT_DIR="$(prompt "Audio output dir" "${DEFAULT_AUDIO_OUTPUT_DIR}")"

PNPM_PATH="$(command -v pnpm)"
PI_CMD="${INSTALL_DIR}/node_modules/.bin/pi"
WEB_DIST="${INSTALL_DIR}/apps/web/dist"

if [[ "${INSTALL_DIR}" != "${REPO_ROOT}" ]]; then
  echo "Copying repo to ${INSTALL_DIR}..."
  sudo mkdir -p "${INSTALL_DIR}"
  sudo rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude apps/web/dist \
    "${REPO_ROOT}/" "${INSTALL_DIR}/"
  sudo chown -R "${RUN_USER}:$(id -gn)" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

echo "Installing dependencies..."
pnpm install

echo "Building web UI..."
pnpm -C apps/web build

sudo mkdir -p /etc/loong

ENV_FILE_CONTENT=$(cat <<EOF
PORT=${PORT}
PI_CMD=${PI_CMD}
PI_CWD=${INSTALL_DIR}
PI_EDIT_ROOT=${INSTALL_DIR}
LOONG_STATE_DIR=${STATE_DIR}
LOONG_CONFIG_PATH=${STATE_DIR}/config.json
LOONG_WEB_DIST=${WEB_DIST}
LOONG_NOTIFY_LOCAL_ONLY=1
LOONG_MAX_BODY_BYTES=262144

LOONG_PASSWORD=${PASSWORD}

LOONG_REBOOT_ENABLED=1
LOONG_REBOOT_DELAY_MS=${REBOOT_DELAY_MS}
LOONG_SYSTEMD_SERVICE=${SERVICE_NAME}

IMG_PIPELINE_AUTO_START=0
AUDIO_PIPELINE_AUTO_START=0
IMG_PIPELINE_DIR=${IMG_PIPELINE_DIR}
AUDIO_PIPELINE_DIR=${AUDIO_PIPELINE_DIR}
IMG_PIPELINE_INPUT_DIRS=${IMG_INPUT_DIRS}
AUDIO_PIPELINE_INPUT_DIRS=${AUDIO_INPUT_DIRS}
IMG_PIPELINE_OUTPUT_DIR=${IMG_OUTPUT_DIR}
AUDIO_PIPELINE_OUTPUT_DIR=${AUDIO_OUTPUT_DIR}

LOONG_UPLOAD_DIR=${STATE_DIR}/uploads
LOONG_UPLOAD_MAX_SIZE=10485760
LOONG_UPLOAD_ALLOWED_TYPES=image/,audio/,video/,application/pdf,text/
LOONG_UPLOAD_ALLOW_UNKNOWN=true
EOF
)

echo "Writing /etc/loong/env..."
echo "${ENV_FILE_CONTENT}" | sudo tee /etc/loong/env >/dev/null

SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

SERVICE_CONTENT=$(cat <<EOF
[Unit]
Description=Loong server
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=/etc/loong/env
ExecStart=${PNPM_PATH} -C ${INSTALL_DIR}/apps/server start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
)

echo "Writing ${SERVICE_PATH}..."
echo "${SERVICE_CONTENT}" | sudo tee "${SERVICE_PATH}" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

echo "Done. Service '${SERVICE_NAME}' is running."
echo "Open: http://localhost:${PORT}/"
