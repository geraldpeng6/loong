import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

export type PluginStatus = {
  id: string;
  name?: string;
  description?: string;
  enabled: boolean;
};

export const createPluginsRoute = ({
  notifyLocalOnly,
  plugins,
}: {
  notifyLocalOnly: boolean;
  plugins: PluginStatus[];
}): RouteHandler => {
  return (req, res, url) => {
    if (url.pathname !== "/api/plugins") return false;
    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }

    sendJson(res, 200, { success: true, plugins });
    return true;
  };
};
