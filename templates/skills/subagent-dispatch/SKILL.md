---
name: subagent-dispatch
description: Dispatch subagent tasks via Loong API (sessions_spawn style). Use for orchestration with auto-return results.
license: Internal
---

# Subagent Dispatch (Loong)

Use this skill to spawn another agent via Loong's `/api/subagents/spawn` endpoint.
It returns the subagent result directly (tool output), so the parent can continue.
If you set `replyMode: "direct"`, Loong will send the subagent result straight to the
user channel (iMessage/Web) and return an empty reply to reduce token usage.

## Requirements
- Loong server must be running
- If `LOONG_PASSWORD` is set, use HTTP Basic Auth

## Environment
- `LOONG_PORT` (optional, default 17800)
- `LOONG_PASSWORD` (optional)
- `LOONG_AGENT_ID` (provided by Loong)

## Preferred: internal tool (no curl)
If the tool `loong_subagent_spawn` is available, use it instead of curl.
It calls the same endpoint but avoids hand-crafted HTTP.

Tool params:
- `agentId`
- `task`
- `timeoutMs` (optional)
- `label` (optional)
- `replyMode` (optional: `parent` | `direct`)

## Example: Spawn taotie
```bash
PORT=${LOONG_PORT:-17800}
PASS=${LOONG_PASSWORD:-""}
PARENT=${LOONG_AGENT_ID:-""}
AUTH=""
if [ -n "$PASS" ]; then
  AUTH="-u user:$PASS"
fi

curl -sS $AUTH \
  -H "content-type: application/json" \
  -X POST "http://localhost:${PORT}/api/subagents/spawn" \
  -d '{"task":"抓取RSS并生成摘要","agentId":"taotie","parentAgentId":"'"$PARENT"'","timeoutMs":180000}'
```

## Example: Direct reply to user
```bash
PORT=${LOONG_PORT:-17800}
PASS=${LOONG_PASSWORD:-""}
PARENT=${LOONG_AGENT_ID:-""}
AUTH=""
if [ -n "$PASS" ]; then
  AUTH="-u user:$PASS"
fi

curl -sS $AUTH \
  -H "content-type: application/json" \
  -X POST "http://localhost:${PORT}/api/subagents/spawn" \
  -d '{"task":"抓取RSS并生成摘要","agentId":"taotie","parentAgentId":"'"$PARENT"'","timeoutMs":180000,"replyMode":"direct"}'
```

## Notes
- `parentAgentId` 必须是当前执行任务的 agent。
- `timeoutMs` 可选（默认 60000），长任务建议提高。
- `replyMode: "direct"` 会把子任务结果直接发送到用户通道（iMessage/Web），并返回空 `reply`。
- Loong 会校验 allowlist 与最大深度（默认 2）。
- 返回 JSON `{ success, runId, reply, replyMode }`。
