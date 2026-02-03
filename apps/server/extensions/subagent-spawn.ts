import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const ReplyModeSchema = Type.Optional(
  Type.String({
    description: "Reply mode: parent | direct (optional)",
  }),
);

const SubagentSpawnParams = Type.Object({
  agentId: Type.String({ description: "Target agent id" }),
  task: Type.String({ description: "Task for the subagent" }),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds", default: 60000 })),
  label: Type.Optional(Type.String({ description: "Optional label for the run" })),
  replyMode: ReplyModeSchema,
});

const resolveBasicAuth = (password) => {
  if (!password) return null;
  const token = Buffer.from(`user:${password}`).toString("base64");
  return `Basic ${token}`;
};

const normalizeReplyMode = (value) => {
  if (!value) return undefined;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed !== "parent" && trimmed !== "direct") return undefined;
  return trimmed;
};

export default function registerSubagentSpawn(pi: ExtensionAPI) {
  pi.registerTool({
    name: "loong_subagent_spawn",
    label: "Loong Subagent Spawn",
    description:
      "Spawn a Loong subagent without curl. Uses LOONG_PORT/LOONG_PASSWORD/LOONG_AGENT_ID.",
    parameters: SubagentSpawnParams,
    async execute(_toolCallId, params, signal) {
      const port = process.env.LOONG_PORT || "17800";
      const password = process.env.LOONG_PASSWORD || "";
      const parentAgentId = process.env.LOONG_AGENT_ID || "";
      if (!parentAgentId) {
        throw new Error("Missing LOONG_AGENT_ID for subagent spawn");
      }

      const url = `http://localhost:${port}/api/subagents/spawn`;
      const headers = { "content-type": "application/json" };
      const auth = resolveBasicAuth(password);
      if (auth) headers.authorization = auth;

      const body = {
        task: params.task,
        agentId: params.agentId,
        parentAgentId,
        timeoutMs: params.timeoutMs ?? 60000,
      };
      if (params.label) body.label = params.label;
      const replyMode = normalizeReplyMode(params.replyMode);
      if (replyMode) body.replyMode = replyMode;

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const raw = await response.text();
        let payload = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = payload?.error || raw || response.statusText || "Spawn failed";
          throw new Error(message);
        }

        if (payload?.error) {
          throw new Error(payload.error);
        }

        const reply = typeof payload?.reply === "string" ? payload.reply : "";
        const mode = payload?.replyMode || replyMode || "parent";
        const text = reply
          ? reply
          : `subagent dispatched (runId: ${payload?.runId || "n/a"}, replyMode: ${mode})`;

        return {
          content: [{ type: "text", text }],
          details: payload || {},
        };
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    },
  });
}
