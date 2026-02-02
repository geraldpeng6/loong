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
export LOONG_NOTIFY_LOCAL_ONLY=1
export LOONG_MAX_BODY_BYTES=262144
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
  "defaultAgent": "reviewer",
  "notifyOnStart": true,
  "replyPrefixMode": "always",
  "keywordMode": "prefix"
}
```

## Agents (pi subagent format)

Loong loads agents from `~/.pi/agent/agents/*.md` using the same frontmatter format as pi subagent
definitions. Loong does **not** read `~/.loong/agents` anymore.

```markdown
---
name: reviewer
description: Code review specialist
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.2-codex
thinkingLevel: medium
noSkills: true
skills:
  - ~/.pi/skills/review
---
You are a seasoned code reviewer.
```

Notes:
- `name` is the agent id used for routing.
- `skills`/`noSkills` are optional; when set, Loong passes `--skill`/`--no-skills` to the pi process.
- Memory files are stored under `~/.loong/pi-agents/<name>/memory` with index `MEMORY.md`.
- Session history is stored under `~/loongspace/<name>` (or `LOONG_SPACE`).

## iMessage (optional)
Requires macOS + Messages signed in + `imsg` CLI.

```bash
brew install steipete/tap/imsg

# required
export IMESSAGE_ENABLED=1
export IMESSAGE_CLI_PATH=/usr/local/bin/imsg   # or /opt/homebrew/bin/imsg
export IMESSAGE_DB_PATH=/Users/<you>/Library/Messages/chat.db

# optional
export LOONG_IMESSAGE_AUTO=1   # auto-enable if chat.db exists (default: 1)
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
- If `IMESSAGE_DB_PATH` is not set, defaults to `~/Library/Messages/chat.db`.
- Auto-enable: `LOONG_IMESSAGE_AUTO=1` (default) turns iMessage on when the DB exists. Disable with `IMESSAGE_ENABLED=0` or `LOONG_IMESSAGE_AUTO=0`.
- Session mode: `IMESSAGE_SESSION_MODE=shared` (one shared session) or `per-chat` (map per chat).
- Mapping file (per-chat mode only): `~/.loong/pi-agents/<id>/imessage-session-map.json` (per agent).
- Outbound media files are written to `IMESSAGE_OUTBOUND_DIR` (default: `~/.loong/imessage-outbound`).
- Replies are sent back to the same `chat_id` (if present) or sender handle.
- Keyword routing (prefix at start only):
  - `Jarvis 帮我写个脚本` → route to Jarvis agent
  - `Gump 给我讲个故事` → route to Gump agent
- Voice-friendly commands (no prefix required):
  - `new [provider/model] [message]` → start a fresh session (optional model)
- Avoid using the Web UI concurrently if you need strict routing.

## Endpoints
- Web UI: `http://localhost:17800/`
- HTTP health: `GET http://localhost:17800/health`
- WebSocket: `ws://localhost:17800/ws`
- HTTP API:
  - `POST http://localhost:17800/api/notify` (local-only by default)
  - `POST http://localhost:17800/api/ask`

### POST /api/notify
Local-only by default (`LOONG_NOTIFY_LOCAL_ONLY=0` to allow remote). JSON body:
```json
{
  "text": "hello",
  "agentId": "jarvis",
  "scope": "agent",
  "prefix": true
}
```
- `scope`: `agent` (only clients on that agent) or `all` (broadcast).
- `prefix`: default `true` when `agentId` is provided.
- Request body limit via `LOONG_MAX_BODY_BYTES`.

### POST /api/ask
Send a prompt to the current agent and return its reply.

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
