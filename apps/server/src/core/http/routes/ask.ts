import type { RouteHandler } from "../types.js";
import { sendJson } from "../utils.js";
import { matchRebootCommand } from "../../gateway/commands.js";

export const createAskRoute = ({
  readBody,
  agents,
  defaultAgentId,
  enqueueAgentPrompt,
  scheduleReboot,
}): RouteHandler => {
  return async (req, res, url) => {
    if (url.pathname !== "/api/ask" || req.method !== "POST") return false;

    try {
      const body = await readBody(req);
      const { message, agentId = defaultAgentId, timeoutMs = 60000 } = body;
      if (!message || typeof message !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'message' field" });
        return true;
      }

      const trimmed = message.trim();
      const rebootCommand = matchRebootCommand(trimmed);
      if (rebootCommand) {
        if (!scheduleReboot) {
          sendJson(res, 400, { success: false, message: "重启功能未配置。" });
          return true;
        }
        const result = scheduleReboot({ reason: rebootCommand.remainder, source: "api" });
        sendJson(res, result.ok ? 200 : 400, {
          success: result.ok,
          message: result.message,
          scheduledAt: result.scheduledAt,
          alreadyScheduled: result.alreadyScheduled || false,
        });
        return true;
      }

      const agent = agents.get(agentId) || agents.get(defaultAgentId);
      if (!agent) {
        sendJson(res, 404, { error: "Agent not found" });
        return true;
      }

      if (agent.busy) {
        sendJson(res, 503, { error: "Agent is busy, try again later", busy: true });
        return true;
      }

      console.log(`[loong] /api/ask processing: ${message.substring(0, 50)}...`);

      const replyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for agent response"));
        }, timeoutMs);

        enqueueAgentPrompt(agent, {
          source: "api",
          text: message,
          onReply: (reply) => {
            clearTimeout(timeout);
            resolve(reply);
          },
        });
      });

      try {
        const reply = await replyPromise;
        console.log(`[loong] /api/ask reply: ${reply.substring(0, 50)}...`);
        sendJson(res, 200, { success: true, reply });
      } catch (err) {
        sendJson(res, 504, { error: err.message });
      }
    } catch (err) {
      const status = err?.message === "Request body too large" ? 413 : 400;
      sendJson(res, status, {
        error: status === 413 ? "Request body too large" : "Invalid JSON body",
      });
    }

    return true;
  };
};
