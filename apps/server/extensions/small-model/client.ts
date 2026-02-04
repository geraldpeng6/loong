import { complete, getModel } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SmallModelConfig = {
  provider?: string;
  modelId?: string;
  reasoningEffort?: "off" | "low" | "medium" | "high" | "xhigh";
  temperature?: number;
  maxTokens?: number;
};

type SmallModelRequest = {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: Array<{ type: "text"; text: string }>;
    timestamp?: number;
  }>;
  provider?: string;
  modelId?: string;
  reasoningEffort?: SmallModelConfig["reasoningEffort"];
  temperature?: number;
  maxTokens?: number;
};

type SmallModelResult =
  | { ok: true; text: string; response: unknown }
  | { ok: false; error: string };

const DEFAULT_CONFIG: Required<Pick<SmallModelConfig, "provider" | "modelId">> &
  Partial<SmallModelConfig> = {
  provider: "openai",
  modelId: "gpt-4o-mini",
  reasoningEffort: "low",
  temperature: 0.2,
  maxTokens: 128,
};

const configPath = join(dirname(fileURLToPath(import.meta.url)), "config.json");
let cachedConfig: SmallModelConfig | null = null;

const normalizeConfig = (raw: SmallModelConfig | null): SmallModelConfig => {
  const merged = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const cleaned: SmallModelConfig = {
    provider: merged.provider?.trim() || undefined,
    modelId: merged.modelId?.trim() || undefined,
    reasoningEffort: merged.reasoningEffort,
    temperature: Number.isFinite(merged.temperature) ? merged.temperature : undefined,
    maxTokens: Number.isFinite(merged.maxTokens) ? merged.maxTokens : undefined,
  };
  return cleaned;
};

const loadConfig = (): SmallModelConfig => {
  if (cachedConfig) return cachedConfig;
  if (!existsSync(configPath)) {
    cachedConfig = normalizeConfig(null);
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as SmallModelConfig;
    cachedConfig = normalizeConfig(raw);
    return cachedConfig;
  } catch (error) {
    console.warn(`[small-model] Failed to read config: ${String(error)}`);
    cachedConfig = normalizeConfig(null);
    return cachedConfig;
  }
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

export const getSmallModelConfig = (): SmallModelConfig => loadConfig();

export const getSmallModelConfigPath = (): string => configPath;

export const setSmallModelConfig = (
  next: SmallModelConfig,
): { ok: true; config: SmallModelConfig } | { ok: false; error: string } => {
  const merged = normalizeConfig({ ...loadConfig(), ...next });
  try {
    writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    cachedConfig = merged;
    return { ok: true, config: merged };
  } catch (error) {
    return { ok: false, error: `Failed to write config: ${String(error)}` };
  }
};

export const completeWithSmallModel = async (
  ctx: ExtensionContext,
  request: SmallModelRequest,
): Promise<SmallModelResult> => {
  const config = loadConfig();
  const provider = request.provider || config.provider;
  const modelId = request.modelId || config.modelId;

  if (!provider || !modelId) {
    return { ok: false, error: "Small model config missing provider/modelId" };
  }

  const model = ctx.modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) {
    return { ok: false, error: `Small model not found: ${provider}/${modelId}` };
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) {
    return { ok: false, error: `No API key for ${provider}/${modelId}` };
  }

  const response = await complete(
    model,
    { messages: request.messages },
    {
      apiKey,
      reasoningEffort: request.reasoningEffort ?? config.reasoningEffort,
      temperature: request.temperature ?? config.temperature,
      maxTokens: request.maxTokens ?? config.maxTokens,
    },
  );

  return { ok: true, text: extractText(response.content), response };
};
