import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

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
      const config = readModelsConfig();
      const providers = getBuiltinProviderCatalog();
      sendJson(res, 200, {
        providers,
        config,
        path: modelsPath,
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

        const config = readModelsConfig();
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
