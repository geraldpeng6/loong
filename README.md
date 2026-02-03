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
- `@mariozechner/pi-coding-agent` available (installed locally via `pnpm install`; global install optional)

## Install

```bash
cd /Users/jiale/code/loong
pnpm install
```

## Run

```bash
# optional overrides (PI_CMD defaults to local node_modules/.bin/pi when available)
export PORT=17800
export PI_CMD=pi
export PI_CWD=/Users/jiale/code/loong
export LOONG_STATE_DIR=/Users/jiale/.loong
export LOONG_CONFIG_PATH=/Users/jiale/.loong/config.json
export LOONG_PASSWORD=your-password
export LOONG_NOTIFY_LOCAL_ONLY=1
export LOONG_MAX_BODY_BYTES=262144
export PI_EDIT_ROOT=/Users/jiale/code/loong

# img-pipeline integration (optional)
export IMG_PIPELINE_DIR=/Users/jiale/temp-workspaces/lucy2workspace/img-pipeline
# or explicitly set query-embed path:
# export IMG_PIPELINE_QUERY_CMD=/path/to/img-pipeline/bin/query-embed
# optional limits for /api/pipeline/query-media:
# export IMG_PIPELINE_MAX_TOP=20
# export IMG_PIPELINE_MAX_BYTES=$((5*1024*1024))
# export IMG_PIPELINE_MAX_TOTAL_BYTES=$((20*1024*1024))

# file upload configuration (optional)
export LOONG_UPLOAD_DIR=/Users/jiale/.loong/uploads
export LOONG_UPLOAD_MAX_SIZE=$((10*1024*1024))  # 10MB default
export LOONG_UPLOAD_ALLOWED_TYPES="image/,audio/,video/,application/pdf,text/"
export LOONG_UPLOAD_ALLOW_UNKNOWN=true

pnpm start
```

## Development

```bash
pnpm lint
pnpm format
pnpm format:check
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

Quick setup (copy built-in templates, including `main` + `nuwa` + `cangjie` + `taotie` + `wugang`):

```bash
pnpm setup:agents
```

Agent/skill scaffolding scripts:

```bash
# Create a new agent + workspace scaffold
pnpm create:agent -- \
  --id bubugao \
  --name-zh 步步高 \
  --name-en Bubugao \
  --description "Math tutor" \
  --tools "read, write, edit, bash"

# Create a new skill scaffold
pnpm create:skill -- \
  --name pdf-tools \
  --description "Work with PDFs (extract, merge, fill)."
```

`nuwa` (女娲) is the built-in builder agent that uses these scripts/templates.
`cangjie` (仓颉) is the built-in document/presentation agent (pptx/pdf/docx/xlsx).
`taotie` (饕餮) is the built-in web research/data agent (web-search/rss/webapp-testing/xlsx).
`wugang` (吴刚) is the built-in scheduler agent that dispatches periodic tasks.

Skill templates live under `templates/skills/<skill>/SKILL.md` and can be synced with:

```bash
pnpm setup:skills
```

```markdown
---
name: reviewer
description: Code review specialist
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.2-codex
thinkingLevel: medium
noSkills: true
skills:
  - ~/.pi/agent/skills/review
---

You are a seasoned code reviewer.
```

Notes:

- `name` is the agent id used for routing.
- `skills`/`noSkills` are optional; when set, Loong passes `--skill`/`--no-skills` to the pi process.
- Workspaces live under `~/.loong/workspaces/<name>` (AGENTS.md, SOUL.md, MEMORY.md).
- Memory files are stored under `~/.loong/workspaces/<name>/memory` with index `MEMORY.md`.
- Session history is stored under `~/.loong/sessions/<name>/transcripts` with index `sessions.json`.

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
- Mapping file (per-chat mode only): `~/.loong/runtime/channels/imessage/session-map/<id>.json` (per agent).
- Outbound media files are written to `IMESSAGE_OUTBOUND_DIR` (default: `~/.loong/runtime/outbound/imessage`).
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
  - `POST http://localhost:17800/api/pipeline/query-media` (query + media)
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

### POST /api/pipeline/query-media

Run img-pipeline semantic search and return media contents.

```json
{
  "query": "red square",
  "outputDir": "~/output",
  "top": 5,
  "minScore": 0.2,
  "includeContent": true,
  "includePaths": true,
  "maxBytes": 5242880,
  "maxTotalBytes": 20971520,
  "allowedMimeTypes": ["image/"]
}
```

Response:

```json
{
  "success": true,
  "outputDir": "/Users/you/output",
  "results": [
    {
      "score": 0.83,
      "hash": "...",
      "mimeType": "image/png",
      "fileName": "image.png",
      "sizeBytes": 12345,
      "path": "/path/to/image.png",
      "content": "base64..."
    }
  ],
  "skipped": []
}
```

Notes:

- Requires `IMG_PIPELINE_DIR` or `IMG_PIPELINE_QUERY_CMD`.
- Limits are enforced by `IMG_PIPELINE_MAX_TOP/IMG_PIPELINE_MAX_BYTES/IMG_PIPELINE_MAX_TOTAL_BYTES`.
- `allowedMimeTypes` supports prefixes (e.g., `image/`, `audio/`).

### POST /api/ask

Send a prompt to the current agent and return its reply.

### POST /api/upload

Upload files (multipart/form-data). Returns file metadata with `fileId` for use with WebSocket `prompt_with_attachments`.

```bash
curl -F "file=@image.png" -F "source=web" http://localhost:17800/api/upload
```

Response:

```json
{
  "success": true,
  "file": {
    "fileId": "abc123",
    "fileName": "image.png",
    "mimeType": "image/png",
    "size": 12345,
    "url": "http://localhost:17800/api/files/abc123",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/files/:fileId

Download or view an uploaded file.

- Add `?download=true` to force download.
- Files are served with appropriate `Content-Type` headers.

### DELETE /api/files/:fileId

Delete an uploaded file.

### WebSocket: prompt_with_attachments

Send a message with file attachments:

```json
{
  "type": "prompt_with_attachments",
  "message": "Analyze these images",
  "attachments": [
    {
      "fileId": "abc123",
      "fileName": "chart.png",
      "mimeType": "image/png",
      "size": 12345,
      "url": "http://localhost:17800/api/files/abc123"
    }
  ]
}
```

The agent will receive the message with attachments embedded as base64 content.

## Example WebSocket command

Send JSON (one object per message):

```json
{ "type": "prompt", "message": "Hello" }
```

### Session switching

```json
{ "type": "new_session" }
```

```json
{ "type": "switch_session", "sessionPath": "/path/to/session.jsonl" }
```

The gateway just forwards messages; all RPC commands are supported (see `docs/rpc.md`).
