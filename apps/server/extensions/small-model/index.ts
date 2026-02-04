import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getSmallModelConfig, getSmallModelConfigPath, setSmallModelConfig } from "./client";

type ModelRef = { provider: string; modelId: string };

const MAX_LIST = 60;
const TOGGLE_SHORTCUT = "ctrl+shift+m";
let lastPrimaryModel: ModelRef | null = null;

const notify = (
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning" | "error" = "info",
) => {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
};

const formatLabel = (provider?: string, modelId?: string): string => {
  if (!provider || !modelId) return "not configured";
  return `${provider}/${modelId}`;
};

const parseModelSpec = (input: string): ModelRef | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/")) {
    const [provider, ...rest] = trimmed.split("/");
    const modelId = rest.join("/");
    if (!provider || !modelId) return null;
    return { provider: provider.trim(), modelId: modelId.trim() };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const [provider, ...rest] = parts;
  return { provider, modelId: rest.join(" ") };
};

const listAvailableModels = (ctx: ExtensionCommandContext): string[] => {
  const registry = ctx.modelRegistry as unknown as {
    getAvailable?: () => Array<{ provider: string; id: string }>;
    getAll?: () => Array<{ provider: string; id: string }>;
  };

  const models = registry.getAvailable?.() || registry.getAll?.() || [];
  return models.map((model) => `${model.provider}/${model.id}`).sort((a, b) => a.localeCompare(b));
};

const getSmallModelRef = (): ModelRef | null => {
  const config = getSmallModelConfig();
  if (!config.provider || !config.modelId) return null;
  return { provider: config.provider, modelId: config.modelId };
};

const isSameModel = (model: { provider: string; id: string }, ref: ModelRef): boolean => {
  return model.provider === ref.provider && model.id === ref.modelId;
};

const setActiveModel = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  ref: ModelRef,
): Promise<boolean> => {
  const model = ctx.modelRegistry.find(ref.provider, ref.modelId);
  if (!model) {
    notify(ctx, `Model not found: ${ref.provider}/${ref.modelId}`, "warning");
    return false;
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) {
    notify(ctx, `No API key for ${ref.provider}/${ref.modelId}`, "warning");
    return false;
  }

  const success = await pi.setModel(model);
  if (!success) {
    notify(ctx, `Failed to switch model to ${ref.provider}/${ref.modelId}`, "warning");
    return false;
  }

  return true;
};

const toggleSmallModel = async (pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> => {
  const smallRef = getSmallModelRef();
  if (!smallRef) {
    notify(
      ctx,
      "Small model not configured. Use /small-model set <provider>/<modelId>.",
      "warning",
    );
    return;
  }

  const current = ctx.model;
  if (current && isSameModel(current, smallRef)) {
    if (!lastPrimaryModel) {
      notify(ctx, "No previous model to restore.", "warning");
      return;
    }
    const restored = await setActiveModel(pi, ctx, lastPrimaryModel);
    if (restored) {
      notify(
        ctx,
        `Model restored to ${formatLabel(lastPrimaryModel.provider, lastPrimaryModel.modelId)}`,
        "info",
      );
    }
    return;
  }

  if (current && (!smallRef || !isSameModel(current, smallRef))) {
    lastPrimaryModel = { provider: current.provider, modelId: current.id };
  }

  const switched = await setActiveModel(pi, ctx, smallRef);
  if (switched) {
    notify(
      ctx,
      `Model switched to small: ${formatLabel(smallRef.provider, smallRef.modelId)}`,
      "info",
    );
  }
};

export default function (pi: ExtensionAPI) {
  pi.registerShortcut(TOGGLE_SHORTCUT, {
    description: "Toggle active model to small-model",
    handler: async (ctx) => {
      await toggleSmallModel(pi, ctx);
    },
  });

  pi.registerCommand("small-model", {
    description: "Show or update small model configuration",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const config = getSmallModelConfig();
      const usage = "Usage: /small-model [list|set <provider>/<modelId>|toggle]";

      if (!trimmed) {
        const message = `small-model: ${formatLabel(config.provider, config.modelId)} (config: ${getSmallModelConfigPath()})\n${usage}`;
        notify(ctx, message, "info");
        return;
      }

      const [command, ...rest] = trimmed.split(/\s+/);
      const commandLower = command.toLowerCase();

      if (commandLower === "toggle") {
        await toggleSmallModel(pi, ctx);
        return;
      }

      if (commandLower === "list") {
        const items = listAvailableModels(ctx);
        if (items.length === 0) {
          notify(ctx, "No models with configured keys found.", "warning");
          return;
        }
        const limited = items.slice(0, MAX_LIST);
        const suffix = items.length > MAX_LIST ? `\n... (${items.length - MAX_LIST} more)` : "";
        notify(ctx, `Available models (${items.length}):\n${limited.join("\n")}${suffix}`, "info");
        return;
      }

      const targetSpec =
        commandLower === "set" || commandLower === "use" ? rest.join(" ") : trimmed;
      const parsed = parseModelSpec(targetSpec);
      if (!parsed) {
        notify(ctx, `Invalid model spec. ${usage}`, "warning");
        return;
      }

      const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
      if (!model) {
        notify(
          ctx,
          `Model not found: ${parsed.provider}/${parsed.modelId}. Use /small-model list`,
          "warning",
        );
        return;
      }

      const apiKey = await ctx.modelRegistry.getApiKey(model);
      if (!apiKey) {
        notify(ctx, `No API key for ${parsed.provider}/${parsed.modelId}`, "warning");
        return;
      }

      const result = setSmallModelConfig({ provider: parsed.provider, modelId: parsed.modelId });
      if (!result.ok) {
        notify(ctx, result.error, "error");
        return;
      }

      notify(ctx, `small-model set to ${formatLabel(parsed.provider, parsed.modelId)}`, "info");
    },
  });
}
