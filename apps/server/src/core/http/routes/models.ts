import { getEnvApiKey } from "@mariozechner/pi-ai";
import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

const PROVIDER_AUTH_HINTS: Record<string, { envVars?: string[]; loginHint?: string }> = {
  openai: { envVars: ["OPENAI_API_KEY"] },
  "openai-codex": { loginHint: "Run pi in a terminal and use /login (or set OPENAI_API_KEY)." },
  anthropic: { envVars: ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] },
  google: { envVars: ["GEMINI_API_KEY"] },
  "google-vertex": {
    envVars: ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
    loginHint: "Run `gcloud auth application-default login` on the server.",
  },
  "amazon-bedrock": {
    envVars: [
      "AWS_PROFILE",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_BEARER_TOKEN_BEDROCK",
      "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
      "AWS_CONTAINER_CREDENTIALS_FULL_URI",
      "AWS_WEB_IDENTITY_TOKEN_FILE",
    ],
  },
  "azure-openai-responses": { envVars: ["AZURE_OPENAI_API_KEY"] },
  groq: { envVars: ["GROQ_API_KEY"] },
  cerebras: { envVars: ["CEREBRAS_API_KEY"] },
  xai: { envVars: ["XAI_API_KEY"] },
  openrouter: { envVars: ["OPENROUTER_API_KEY"] },
  "vercel-ai-gateway": { envVars: ["AI_GATEWAY_API_KEY"] },
  zai: { envVars: ["ZAI_API_KEY"] },
  mistral: { envVars: ["MISTRAL_API_KEY"] },
  minimax: { envVars: ["MINIMAX_API_KEY"] },
  "minimax-cn": { envVars: ["MINIMAX_CN_API_KEY"] },
  huggingface: { envVars: ["HF_TOKEN"] },
  opencode: { envVars: ["OPENCODE_API_KEY"] },
  "kimi-coding": { envVars: ["KIMI_API_KEY"] },
  "github-copilot": {
    envVars: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
    loginHint: "Use /login in pi or export a GitHub token on the server.",
  },
};

type ModelsConfigLike = { providers?: Record<string, { apiKey?: string }> };

const resolveAuthStatus = (providerId: string, config: ModelsConfigLike) => {
  const hints = PROVIDER_AUTH_HINTS[providerId] || {};
  const envValue = getEnvApiKey(providerId);
  const providerConfig = config?.providers?.[providerId];
  return {
    envVars: hints.envVars || null,
    loginHint: hints.loginHint || null,
    hasEnv: Boolean(envValue),
    hasConfigKey: Boolean(providerConfig?.apiKey),
  };
};

export const createModelsRoutes = ({
  notifyLocalOnly,
  readBody,
  readModelsConfig,
  writeModelsConfig,
  getBuiltinProviderCatalog,
  modelsPath,
  restartAgentProcesses,
}): RouteHandler => {
  return async (req, res, url) => {
    if (url.pathname === "/api/models/registry" && req.method === "GET") {
      if (notifyLocalOnly && !isLocalRequest(req)) {
        sendJson(res, 403, { error: "Forbidden" });
        return true;
      }
      const config = readModelsConfig() as ModelsConfigLike;
      const providers = getBuiltinProviderCatalog();
      const providerIds = new Set([
        ...providers.map((provider) => provider.id),
        ...Object.keys(config.providers || {}),
      ]);
      const auth = Object.fromEntries(
        Array.from(providerIds).map((providerId) => [
          providerId,
          resolveAuthStatus(providerId, config),
        ]),
      );
      sendJson(res, 200, {
        providers,
        config,
        path: modelsPath,
        auth,
      });
      return true;
    }

    if (url.pathname === "/api/models/config" && req.method === "POST") {
      if (notifyLocalOnly && !isLocalRequest(req)) {
        sendJson(res, 403, { error: "Forbidden" });
        return true;
      }

      try {
        const body = await readBody(req);
        const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
        const provider = body.provider && typeof body.provider === "object" ? body.provider : null;
        if (!providerId) {
          sendJson(res, 400, { error: "Missing providerId" });
          return true;
        }
        if (!provider) {
          sendJson(res, 400, { error: "Missing provider config" });
          return true;
        }

        const config = readModelsConfig() as ModelsConfigLike;
        config.providers = config.providers || {};
        config.providers[providerId] = provider;

        const result = writeModelsConfig(config);
        if (!result.ok) {
          sendJson(res, 500, { error: result.error || "Failed to write models.json" });
          return true;
        }

        restartAgentProcesses();

        sendJson(res, 200, {
          success: true,
          config,
        });
      } catch (err) {
        const status = err?.message === "Request body too large" ? 413 : 400;
        sendJson(res, status, {
          error: status === 413 ? "Request body too large" : "Invalid JSON body",
        });
      }
      return true;
    }

    return false;
  };
};
