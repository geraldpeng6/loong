import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type AudioSearchResult = {
  score?: number;
  hash?: string;
  fileName?: string;
  path?: string;
  text?: string;
};

type AudioSearchResponse = {
  success?: boolean;
  error?: string;
  query?: string;
  outputDir?: string;
  results?: AudioSearchResult[];
  skipped?: Array<Record<string, unknown>>;
};

const DEFAULT_TOP = Number(process.env.LOONG_AUDIO_TOP || 5);
const DEFAULT_TIMEOUT_MS = Number(process.env.LOONG_AUDIO_TIMEOUT_MS || 30000);

// Only enable for specific agents
const ALLOWED_AGENTS = ["qiuniu", "囚牛"];

const AudioSearchSchema = Type.Object({
  query: Type.String({
    description: "Search query for audio transcription content",
  }),
  top: Type.Optional(Type.Number({ description: "Max results to return (default: 5)" })),
  minScore: Type.Optional(
    Type.Number({ description: "Minimum similarity score -1 to 1 (optional)" }),
  ),
});

const resolveBasicAuth = (password?: string) => {
  if (!password) return null;
  const token = Buffer.from(`user:${password}`).toString("base64");
  return `Basic ${token}`;
};

const parseFlagValue = (value: string | undefined): number | null => {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseAudioArgs = (raw: string) => {
  const tokens = raw.split(/\s+/).filter(Boolean);
  let top: number | null = null;
  let minScore: number | null = null;
  const queryTokens: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--top" || token === "-t") {
      top = parseFlagValue(tokens[index + 1]) ?? top;
      index += 1;
      continue;
    }
    if (token.startsWith("--top=")) {
      top = parseFlagValue(token.slice("--top=".length)) ?? top;
      continue;
    }
    if (token === "--min" || token === "--minScore") {
      minScore = parseFlagValue(tokens[index + 1]) ?? minScore;
      index += 1;
      continue;
    }
    if (token.startsWith("--min=")) {
      minScore = parseFlagValue(token.slice("--min=".length)) ?? minScore;
      continue;
    }

    queryTokens.push(token);
  }

  return {
    query: queryTokens.join(" ").trim(),
    top: top ?? undefined,
    minScore: minScore ?? undefined,
  };
};

const formatScore = (score?: number) => {
  if (!Number.isFinite(score)) return "n/a";
  return Number(score).toFixed(3);
};

export default function registerAudioSearch(pi: ExtensionAPI) {
  // Check if this agent is allowed to use this tool
  const agentId = process.env.LOONG_AGENT_ID || "";
  const isAllowed = ALLOWED_AGENTS.some((id) => agentId.toLowerCase().includes(id.toLowerCase()));

  if (!isAllowed) {
    // Extension loaded but no tools registered for this agent
    return;
  }

  pi.registerTool({
    name: "loong_audio_search",
    label: "Audio Search",
    description:
      "Search through transcribed audio files (meeting recordings, voice memos, etc.). Use when user asks about audio content, recordings, or meetings.",
    parameters: AudioSearchSchema,
    async execute(_toolCallId, params) {
      const port = process.env.LOONG_PORT || "17800";
      const password = process.env.LOONG_PASSWORD || "";
      const url = `http://localhost:${port}/api/audio-pipeline/query`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      const auth = resolveBasicAuth(password);
      if (auth) headers.authorization = auth;

      const payload = {
        query: params.query,
        top: params.top ?? DEFAULT_TOP,
        minScore: params.minScore,
        includeTranscription: true,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const raw = await response.text();
        let data: AudioSearchResponse | null = null;
        try {
          data = raw ? (JSON.parse(raw) as AudioSearchResponse) : null;
        } catch {
          data = null;
        }

        if (!response.ok) {
          const message = data?.error || raw || response.statusText || "Audio search failed";
          throw new Error(message);
        }
        if (!data?.success) {
          const message = data?.error || "Audio search failed";
          throw new Error(message);
        }

        const results = Array.isArray(data.results) ? data.results : [];
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No audio results for "${params.query}".` }],
            details: { query: params.query, results: [], skipped: data.skipped || [] },
          };
        }

        const lines = results.map((item, index) => {
          const label = item.fileName || item.hash || `result-${index + 1}`;
          const preview = item.text ? ` | ${item.text.slice(0, 60)}...` : "";
          return `${index + 1}. score=${formatScore(item.score)} ${label}${preview}`;
        });
        const summary = [
          `Audio search for "${params.query}" (${results.length} result(s))`,
          ...lines,
        ].join("\n");

        const content: Array<{ type: "text"; text: string }> = [{ type: "text", text: summary }];

        const media = results
          .map((item) => ({
            score: item.score,
            hash: item.hash,
            fileName: item.fileName,
            path: item.path,
            text: item.text,
          }))
          .filter((item) => item.path);

        return {
          content,
          details: {
            query: params.query,
            outputDir: data.outputDir || null,
            results: results.map((item) => ({
              score: item.score,
              hash: item.hash,
              fileName: item.fileName,
              text: item.text?.slice(0, 200),
            })),
            media,
            skipped: data.skipped || [],
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  });

  // Handle /audio command
  pi.on("input", (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    const text = event.text?.trim() || "";

    if (text.toLowerCase().startsWith("/audio")) {
      const remainder = text.replace(/^\/audio\b/i, "").trim();
      const parsed = parseAudioArgs(remainder);
      if (!parsed.query) {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /audio <query> [--top N] [--min score]", "info");
        }
        return { action: "handled" };
      }

      return {
        action: "transform",
        text: `Search for audio content: "${parsed.query}"`,
      };
    }

    return { action: "continue" };
  });
}
