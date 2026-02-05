#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only." >&2
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
DEFAULT_LABEL="com.loong.server"
DEFAULT_REBOOT_DELAY_MS="1000"
DEFAULT_LOG_FILE="${HOME_DIR}/Library/Logs/loong.log"
DEFAULT_ERR_FILE="${HOME_DIR}/Library/Logs/loong.err"

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
LAUNCH_LABEL="$(prompt "launchd label" "${DEFAULT_LABEL}")"
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
LOG_FILE="${DEFAULT_LOG_FILE}"
ERR_FILE="${DEFAULT_ERR_FILE}"

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

PLIST_DIR="${HOME_DIR}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LAUNCH_LABEL}.plist"

mkdir -p "${PLIST_DIR}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${PNPM_PATH}</string>
      <string>-C</string>
      <string>${INSTALL_DIR}/apps/server</string>
      <string>start</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PORT</key>
      <string>${PORT}</string>
      <key>PI_CMD</key>
      <string>${PI_CMD}</string>
      <key>PI_CWD</key>
      <string>${INSTALL_DIR}</string>
      <key>PI_EDIT_ROOT</key>
      <string>${INSTALL_DIR}</string>
      <key>LOONG_STATE_DIR</key>
      <string>${STATE_DIR}</string>
      <key>LOONG_CONFIG_PATH</key>
      <string>${STATE_DIR}/config.json</string>
      <key>LOONG_WEB_DIST</key>
      <string>${WEB_DIST}</string>
      <key>LOONG_PASSWORD</key>
      <string>${PASSWORD}</string>
      <key>LOONG_NOTIFY_LOCAL_ONLY</key>
      <string>1</string>
      <key>LOONG_MAX_BODY_BYTES</key>
      <string>262144</string>
      <key>LOONG_INSTALL_DIR</key>
      <string>${INSTALL_DIR}</string>
      <key>LOONG_PNPM_PATH</key>
      <string>${PNPM_PATH}</string>
      <key>LOONG_ENV_FILE</key>
      <string>${STATE_DIR}/env</string>
      <key>LOONG_LOG_FILE</key>
      <string>${LOG_FILE}</string>
      <key>LOONG_ERR_FILE</key>
      <string>${ERR_FILE}</string>

      <key>LOONG_REBOOT_ENABLED</key>
      <string>1</string>
      <key>LOONG_REBOOT_DELAY_MS</key>
      <string>${REBOOT_DELAY_MS}</string>
      <key>LOONG_LAUNCHD_LABEL</key>
      <string>${LAUNCH_LABEL}</string>

      <key>IMG_PIPELINE_AUTO_START</key>
      <string>0</string>
      <key>AUDIO_PIPELINE_AUTO_START</key>
      <string>0</string>
      <key>IMG_PIPELINE_DIR</key>
      <string>${IMG_PIPELINE_DIR}</string>
      <key>AUDIO_PIPELINE_DIR</key>
      <string>${AUDIO_PIPELINE_DIR}</string>
      <key>IMG_PIPELINE_INPUT_DIRS</key>
      <string>${IMG_INPUT_DIRS}</string>
      <key>AUDIO_PIPELINE_INPUT_DIRS</key>
      <string>${AUDIO_INPUT_DIRS}</string>
      <key>IMG_PIPELINE_OUTPUT_DIR</key>
      <string>${IMG_OUTPUT_DIR}</string>
      <key>AUDIO_PIPELINE_OUTPUT_DIR</key>
      <string>${AUDIO_OUTPUT_DIR}</string>

      <key>LOONG_UPLOAD_DIR</key>
      <string>${STATE_DIR}/uploads</string>
      <key>LOONG_UPLOAD_MAX_SIZE</key>
      <string>10485760</string>
      <key>LOONG_UPLOAD_ALLOWED_TYPES</key>
      <string>image/,audio/,video/,application/pdf,text/</string>
      <key>LOONG_UPLOAD_ALLOW_UNKNOWN</key>
      <string>true</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${ERR_FILE}</string>
  </dict>
</plist>
EOF

ENV_PATH="${STATE_DIR}/env"
DEFAULT_STATE_DIR_PATH="${HOME_DIR}/.loong"

mkdir -p "${STATE_DIR}"

cat > "${ENV_PATH}" <<EOF
PORT=${PORT}
PI_CMD=${PI_CMD}
PI_CWD=${INSTALL_DIR}
PI_EDIT_ROOT=${INSTALL_DIR}
LOONG_STATE_DIR=${STATE_DIR}
LOONG_CONFIG_PATH=${STATE_DIR}/config.json
LOONG_WEB_DIST=${WEB_DIST}
LOONG_NOTIFY_LOCAL_ONLY=1
LOONG_MAX_BODY_BYTES=262144
LOONG_INSTALL_DIR=${INSTALL_DIR}
LOONG_PNPM_PATH=${PNPM_PATH}
LOONG_ENV_FILE=${ENV_PATH}
LOONG_LOG_FILE=${LOG_FILE}
LOONG_ERR_FILE=${ERR_FILE}

LOONG_PASSWORD=${PASSWORD}

LOONG_REBOOT_ENABLED=1
LOONG_REBOOT_DELAY_MS=${REBOOT_DELAY_MS}
LOONG_LAUNCHD_LABEL=${LAUNCH_LABEL}

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

if [[ "${STATE_DIR}" != "${DEFAULT_STATE_DIR_PATH}" ]]; then
  mkdir -p "${DEFAULT_STATE_DIR_PATH}"
  ln -sfn "${ENV_PATH}" "${DEFAULT_STATE_DIR_PATH}/env"
fi

CLI_BIN_DIR="/usr/local/bin"
if [[ -d "/opt/homebrew/bin" ]] && [[ ":${PATH}:" == *":/opt/homebrew/bin:"* ]]; then
  CLI_BIN_DIR="/opt/homebrew/bin"
fi

sudo mkdir -p "${CLI_BIN_DIR}"
if [[ -f "${INSTALL_DIR}/bin/loong" ]]; then
  sudo install -m 755 "${INSTALL_DIR}/bin/loong" "${CLI_BIN_DIR}/loong"
fi

launchctl bootout "gui/$(id -u)/${LAUNCH_LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl enable "gui/$(id -u)/${LAUNCH_LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LAUNCH_LABEL}"

echo "Done. LaunchAgent '${LAUNCH_LABEL}' is running."
echo "CLI: loong start|stop|restart|status|logs|serve"
echo "Open: http://localhost:${PORT}/"
