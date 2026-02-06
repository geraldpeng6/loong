import type { IncomingMessage } from "http";
import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";
import { resolveAuthStatus } from "../../models/auth-status.js";
import type { PasswordSnapshot } from "../../auth/password-store.js";

type ModelsConfigLike = {
  providers?: Record<string, { apiKey?: string; models?: Array<{ id?: string }> }>;
};

type ProviderCatalogEntry = { id: string };

type PasswordResult =
  | { ok: true; snapshot: PasswordSnapshot }
  | { ok: false; status: number; error: string };

const countConfiguredProviders = ({
  config,
  providers,
}: {
  config: ModelsConfigLike;
  providers: ProviderCatalogEntry[];
}) => {
  const configuredProviders = config.providers || {};
  const ids = new Set([
    ...providers.map((provider) => provider.id),
    ...Object.keys(configuredProviders),
  ]);
  let configuredCount = 0;

  for (const providerId of ids) {
    const auth = resolveAuthStatus(providerId, config);
    const hasConfig = Boolean(configuredProviders[providerId]);
    if (hasConfig || auth.hasEnv || auth.hasConfigKey) {
      configuredCount += 1;
    }
  }

  return configuredCount;
};

const countConfiguredModels = (config: ModelsConfigLike) => {
  const providers = Object.values(config.providers || {});
  return providers.reduce((sum, provider) => sum + (provider.models?.length || 0), 0);
};

export const createSetupRoute = ({
  notifyLocalOnly,
  readBody,
  isAuthorizedRequest,
  getPasswordSnapshot,
  registerPassword,
  updatePassword,
  readModelsConfig,
  getBuiltinProviderCatalog,
}: {
  notifyLocalOnly: boolean;
  readBody: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  isAuthorizedRequest: (req: IncomingMessage, url?: URL) => boolean;
  getPasswordSnapshot: () => PasswordSnapshot;
  registerPassword: (payload: { username: string; password: string }) => PasswordResult;
  updatePassword: (payload: {
    currentPassword?: string;
    nextPassword: string;
    username?: string;
  }) => PasswordResult;
  readModelsConfig: () => unknown;
  getBuiltinProviderCatalog: () => unknown;
}): RouteHandler => {
  return async (req, res, url) => {
    if (!url.pathname.startsWith("/api/setup/")) return false;

    const local = isLocalRequest(req);
    const authorized = isAuthorizedRequest(req, url);

    if (notifyLocalOnly && !local && !authorized) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    if (url.pathname === "/api/setup/status" && req.method === "GET") {
      const auth = getPasswordSnapshot();
      const config = (readModelsConfig() || { providers: {} }) as ModelsConfigLike;
      const providers = (getBuiltinProviderCatalog() || []) as ProviderCatalogEntry[];
      const configuredProviderCount = countConfiguredProviders({ config, providers });
      const configuredModelCount = countConfiguredModels(config);

      sendJson(res, 200, {
        auth: {
          ...auth,
          authorized,
        },
        models: {
          configuredProviderCount,
          configuredModelCount,
          hasConfiguredProvider: configuredProviderCount > 0,
          hasConfiguredModel: configuredModelCount > 0,
        },
      });
      return true;
    }

    if (url.pathname === "/api/setup/register" && req.method === "POST") {
      if (notifyLocalOnly && !local) {
        sendJson(res, 403, { error: "Forbidden" });
        return true;
      }

      try {
        const body = await readBody(req);
        const username = typeof body.username === "string" ? body.username : "admin";
        const password = typeof body.password === "string" ? body.password : "";
        const result = registerPassword({ username, password });

        if (!result.ok) {
          sendJson(res, result.status, { error: result.error });
          return true;
        }

        sendJson(res, 200, {
          success: true,
          auth: result.snapshot,
        });
      } catch (err) {
        const status = err instanceof Error && err.message === "Request body too large" ? 413 : 400;
        sendJson(res, status, {
          error: status === 413 ? "Request body too large" : "Invalid JSON body",
        });
      }
      return true;
    }

    if (url.pathname === "/api/setup/password" && req.method === "POST") {
      if (!authorized && getPasswordSnapshot().required) {
        sendJson(res, 401, { error: "Unauthorized" });
        return true;
      }

      try {
        const body = await readBody(req);
        const currentPassword =
          typeof body.currentPassword === "string" ? body.currentPassword : undefined;
        const nextPassword = typeof body.nextPassword === "string" ? body.nextPassword : "";
        const username = typeof body.username === "string" ? body.username : undefined;
        const result = updatePassword({ currentPassword, nextPassword, username });

        if (!result.ok) {
          sendJson(res, result.status, { error: result.error });
          return true;
        }

        sendJson(res, 200, {
          success: true,
          auth: result.snapshot,
        });
      } catch (err) {
        const status = err instanceof Error && err.message === "Request body too large" ? 413 : 400;
        sendJson(res, status, {
          error: status === 413 ? "Request body too large" : "Invalid JSON body",
        });
      }
      return true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  };
};
