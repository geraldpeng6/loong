import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

export const createNotifyRoute = ({
  notifyLocalOnly,
  readBody,
  agents,
  getWebChannel,
  formatAgentReply,
}): RouteHandler => {
  return async (req, res, url) => {
    if (url.pathname !== "/api/notify" || req.method !== "POST") return false;

    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    try {
      const body = await readBody(req);
      const { text, agentId, scope, prefix } = body;
      if (!text || typeof text !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'text' field" });
        return true;
      }

      const resolvedScope = scope || (agentId ? "agent" : "all");
      if (resolvedScope !== "agent" && resolvedScope !== "all") {
        sendJson(res, 400, { error: "Invalid 'scope' field" });
        return true;
      }

      const agent = agentId ? agents.get(agentId) : null;
      if (resolvedScope === "agent" && !agent) {
        sendJson(res, 404, { error: "Agent not found" });
        return true;
      }

      const shouldPrefix = typeof prefix === "boolean" ? prefix : Boolean(agent);
      const formattedText = shouldPrefix && agent ? formatAgentReply(agent, text) : text;
      const webChannel = getWebChannel?.();
      const sentCount = webChannel
        ? webChannel.broadcastGatewayMessage({
            scope: resolvedScope,
            agentId: agent?.id ?? null,
            text: formattedText,
          })
        : 0;

      console.log(
        `[loong] /api/notify scope=${resolvedScope} sent=${sentCount}: ${text.substring(0, 50)}...`,
      );
      sendJson(res, 200, {
        success: true,
        sentCount,
        scope: resolvedScope,
        agentId: agent?.id ?? null,
      });
    } catch (err) {
      const status = err?.message === "Request body too large" ? 413 : 400;
      sendJson(res, status, {
        error: status === 413 ? "Request body too large" : "Invalid JSON body",
      });
    }

    return true;
  };
};
