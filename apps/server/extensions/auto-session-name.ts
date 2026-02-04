import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { completeWithSmallModel } from "./small-model/client";

const MAX_TITLE_LENGTH = 20;
const MAX_SOURCE_CHARS = 800;

const buildPrompt = (text: string) =>
  [
    "你是会话标题生成器。",
    `要求：输出不超过 ${MAX_TITLE_LENGTH} 个字符的标题。`,
    "仅输出标题本身，不要引号、不要换行、不要解释。",
    "标题需准确概括用户意图。",
    "用户首句：",
    text,
  ].join("\n");

const normalizeTitle = (raw: string): string => {
  if (!raw) return "";
  let title = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  title = title.replace(/^["'“”‘’`]+/, "").replace(/["'“”‘’`]+$/, "");
  title = title
    .replace(/^[\s:：\-–—#]+/, "")
    .replace(/[。！？.!?]+$/, "")
    .trim();
  if (!title) return "";
  const chars = Array.from(title);
  if (chars.length > MAX_TITLE_LENGTH) {
    title = chars.slice(0, MAX_TITLE_LENGTH).join("");
  }
  return title;
};

const extractText = (content: unknown): string => {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part) => part && typeof part === "object" && (part as { type?: string }).type === "text",
    )
    .map((part) => (part as { text?: string }).text || "")
    .join("")
    .trim();
};

const resolveFallbackModel = (ctx: ExtensionContext) => {
  const current = ctx.model;
  if (current) return current;
  const registry = ctx.modelRegistry as unknown as {
    getAvailable?: () => Array<{ provider: string; id: string }>;
    getAll?: () => Array<{ provider: string; id: string }>;
    find?: (provider: string, modelId: string) => unknown;
  };
  const available = registry.getAvailable?.() || registry.getAll?.() || [];
  if (available.length === 0 || !registry.find) return null;
  const fallback = available[0];
  return registry.find(fallback.provider, fallback.id) || null;
};

const completeWithFallback = async (
  ctx: ExtensionContext,
  request: Parameters<typeof completeWithSmallModel>[1],
) => {
  const smallResult = await completeWithSmallModel(ctx, request);
  if (smallResult.ok) return smallResult;

  const model = resolveFallbackModel(ctx);
  if (!model) return smallResult;

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) return smallResult;

  try {
    const response = await complete(
      model,
      { messages: request.messages },
      {
        apiKey,
        reasoningEffort: request.reasoningEffort,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      },
    );
    return { ok: true as const, text: extractText(response.content), response };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false as const, error: message };
  }
};

type SessionManagerLike = {
  getSessionFile?: () => string | null;
  getSessionId?: () => string | null;
  getEntries?: () => Array<{ type?: string; message?: { role?: string } }>;
  getSessionName?: () => string | null;
};

const getSessionKey = (ctx: { sessionManager: SessionManagerLike }): string => {
  return ctx.sessionManager.getSessionFile?.() || ctx.sessionManager.getSessionId?.() || "unknown";
};

const hasUserMessages = (ctx: { sessionManager: SessionManagerLike }): boolean => {
  const entries = ctx.sessionManager.getEntries?.() || [];
  return entries.some((entry) => entry?.type === "message" && entry?.message?.role === "user");
};

export default function (pi: ExtensionAPI) {
  const inflight = new Map<string, Promise<void>>();
  const completed = new Set<string>();

  pi.on("input", (event, ctx) => {
    const text = event.text?.trim() || "";
    if (!text) return { action: "continue" };
    if (event.source === "extension") return { action: "continue" };
    if (text.startsWith("/") || text.toLowerCase() === "new") {
      return { action: "continue" };
    }

    const existingName = ctx.sessionManager.getSessionName?.() || pi.getSessionName();
    if (existingName) return { action: "continue" };
    if (hasUserMessages(ctx)) return { action: "continue" };

    const sessionKey = getSessionKey(ctx);
    if (completed.has(sessionKey) || inflight.has(sessionKey)) {
      return { action: "continue" };
    }

    const sourceText = text.length > MAX_SOURCE_CHARS ? text.slice(0, MAX_SOURCE_CHARS) : text;

    const task = (async () => {
      const result = await completeWithFallback(ctx, {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: buildPrompt(sourceText) }],
            timestamp: Date.now(),
          },
        ],
        maxTokens: 64,
      });

      if (!result.ok) {
        return;
      }

      const title = normalizeTitle(result.text);
      if (!title) {
        return;
      }

      const currentKey = getSessionKey(ctx);
      const currentName = ctx.sessionManager.getSessionName?.() || pi.getSessionName();
      if (currentKey !== sessionKey || currentName) {
        return;
      }

      pi.setSessionName(title);
      completed.add(sessionKey);
    })();

    inflight.set(
      sessionKey,
      task.finally(() => inflight.delete(sessionKey)),
    );
    return { action: "continue" };
  });
}
