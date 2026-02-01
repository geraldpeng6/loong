# loong

Minimal WebSocket gateway that proxies to `pi --mode rpc`.

## Features
- Multi-agent support (one `pi --mode rpc` process per agent)
- Keyword-based agent routing (e.g. "Jarvis ...", "Gump ...")
- Independent sessions + memory per agent
- WebSocket passthrough for RPC commands/events
- Simple health endpoint
- Web UI renders images/audio/video/files when present in messages

## Requirements
- Node.js >= 20
- `pi` installed globally (`npm install -g @mariozechner/pi-coding-agent`)

## Install
```bash
cd /Users/jiale/code/loong
pnpm install
```

## Run
```bash
# optional overrides
export PORT=17800
export PI_CMD=pi
export PI_CWD=/Users/jiale/code/loong
export LOONG_HOME=/Users/jiale/.loong
export LOONG_CONFIG_PATH=/Users/jiale/.loong/config.json
export LOONG_PASSWORD=your-password
export PI_EDIT_ROOT=/Users/jiale/code/loong

pnpm start
```

## Authentication (optional)
If `LOONG_PASSWORD` is set, all HTTP + WebSocket endpoints require a password.

- Browser: the Web UI will show a Basic Auth prompt. Use any username and the password from `LOONG_PASSWORD`.
- API/WS clients: send `Authorization: Bearer <password>` (or Basic auth).
- WS clients without custom headers: append `?password=...` to the WebSocket URL.

## Configuration

Gateway config file (default: `~/.loong/config.json`):

```json
{
  "agentsDir": "agents",
  "defaultAgent": "jarvis",
  "notifyOnStart": true,
  "replyPrefixMode": "always"
}
```

Agent config file (default: `~/.loong/agents/<id>/agent.json`):

```json
{
  "id": "jarvis",
  "name": "Jarvis",
  "keywords": ["jarvis", "贾维斯"],
  "systemPrompt": "You are Jarvis, a helpful coding assistant.",
  "model": {
    "provider": "openai-codex",
    "modelId": "gpt-5.2-codex"
  },
  "thinkingLevel": "medium",
  "tools": ["read", "bash", "edit", "write"],
  "sessionDir": "sessions",
  "memory": {
    "enabled": true,
    "dir": "memory",
    "indexFile": "MEMORY.md"
  }
}
```

Another agent example:

```json
{
  "id": "gump",
  "name": "Gump",
  "keywords": ["gump", "阿甘"],
  "systemPrompt": "You are Gump, a warm and patient companion.",
  "model": {
    "provider": "kimi-coding",
    "modelId": "k2p5"
  },
  "thinkingLevel": "medium",
  "tools": ["read", "bash", "edit", "write"],
  "sessionDir": "sessions",
  "memory": {
    "enabled": true,
    "dir": "memory",
    "indexFile": "MEMORY.md"
  }
}
```

Notes:
- `systemPromptPath` / `appendSystemPromptPath` can point to files (relative to agent dir)
- Each agent uses its own `sessionDir` and `memory` directory

## iMessage (optional)
Requires macOS + Messages signed in + `imsg` CLI.

```bash
brew install steipete/tap/imsg

# required
export IMESSAGE_ENABLED=1
export IMESSAGE_CLI_PATH=/usr/local/bin/imsg   # or /opt/homebrew/bin/imsg
export IMESSAGE_DB_PATH=/Users/<you>/Library/Messages/chat.db

# optional
export IMESSAGE_SERVICE=auto   # imessage | sms | auto
export IMESSAGE_REGION=US
export IMESSAGE_ATTACHMENTS=1  # include attachments
export IMESSAGE_SESSION_MODE=shared   # shared | per-chat

# optional: enable exec helper (runs on gateway host)
export IMESSAGE_EXEC_ENABLED=1
export IMESSAGE_EXEC_ALLOWLIST="+15551234567,me@example.com"
export IMESSAGE_EXEC_MAX_BYTES=8000
export IMESSAGE_EXEC_TIMEOUT_MS=0

pnpm start
```

If iMessage doesn't start, ensure the terminal has permission to access `~/Library/Messages/chat.db` (Full Disk Access on macOS).

Notes:
- Session mode: `IMESSAGE_SESSION_MODE=shared` (one shared session) or `per-chat` (map per chat).
- Mapping file (per-chat mode only): `~/.loong/agents/<id>/imessage-session-map.json` (per agent).
- Outbound media files are written to `IMESSAGE_OUTBOUND_DIR` (default: `~/.loong/imessage-outbound`).
- Replies are sent back to the same `chat_id` (if present) or sender handle.
- Keyword routing (prefix at start only):
  - `Jarvis 帮我写个脚本` → route to Jarvis agent
  - `Gump 给我讲个故事` → route to Gump agent
- Voice-friendly commands (no prefix required):
  - `new [provider/model] [message]` → start a fresh session (optional model)
- Advanced commands (prefixed, handled by gateway):
  - `!new <provider/model> [message]` → start a fresh session (optional model)
- Customize command prefix via `LOONG_CMD_PREFIX` env var (default: `!`)
- Avoid using the Web UI concurrently if you need strict routing.

## Endpoints
- Web UI: `http://localhost:17800/`
- HTTP health: `GET http://localhost:17800/health`
- WebSocket: `ws://localhost:17800/ws`

## Example WebSocket command
Send JSON (one object per message):
```json
{"type":"prompt","message":"Hello"}
```

### Session switching
```json
{"type":"new_session"}
```
```json
{"type":"switch_session","sessionPath":"/path/to/session.jsonl"}
```

The gateway just forwards messages; all RPC commands are supported (see `docs/rpc.md`).
