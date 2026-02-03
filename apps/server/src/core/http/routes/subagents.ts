import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

export const createSubagentsRoute = ({
  notifyLocalOnly,
  readBody,
  agents,
  enqueueAgentPrompt,
  buildDirectReplyContext,
  subagentRuns,
  subagentDirectReplies,
  persistSubagentRuns,
  randomUUID,
  loongSubagentMaxDepth,
}): RouteHandler => {
  return async (req, res, url) => {
    if (url.pathname !== "/api/subagents/spawn" || req.method !== "POST") return false;

    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    try {
      const body = await readBody(req);
      const {
        task,
        agentId,
        parentAgentId,
        label,
        timeoutMs = 60000,
        replyMode,
        directReply,
      } = body || {};
      if (!task || typeof task !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'task' field" });
        return true;
      }
      if (!agentId || typeof agentId !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'agentId' field" });
        return true;
      }
      if (!parentAgentId || typeof parentAgentId !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'parentAgentId' field" });
        return true;
      }

      const parentAgent = agents.get(parentAgentId);
      if (!parentAgent) {
        sendJson(res, 404, { error: "Parent agent not found" });
        return true;
      }
      const agent = agents.get(agentId);
      if (!agent) {
        sendJson(res, 404, { error: "Agent not found" });
        return true;
      }

      const parentTask = parentAgent.currentTask;
      if (!parentTask) {
        sendJson(res, 409, { error: "Parent agent has no active task" });
        return true;
      }

      const allowAgents = parentAgent.subagents?.allowAgents || [];
      const allowAll = allowAgents.includes("*");
      if (!allowAll && !allowAgents.includes(agentId)) {
        sendJson(res, 403, { error: "Parent agent is not allowed to spawn this agent" });
        return true;
      }

      const parentDepth = Number.isFinite(parentTask.subagentDepth) ? parentTask.subagentDepth : 0;
      const maxDepth = parentAgent.subagents?.maxDepth ?? loongSubagentMaxDepth;
      if (parentDepth + 1 > maxDepth) {
        sendJson(res, 403, { error: "Subagent max depth exceeded" });
        return true;
      }

      let resolvedReplyMode = typeof replyMode === "string" ? replyMode.trim().toLowerCase() : "";
      if (!resolvedReplyMode) {
        resolvedReplyMode = directReply === true ? "direct" : "parent";
      }
      if (!"parent,direct".split(",").includes(resolvedReplyMode)) {
        sendJson(res, 400, { error: "Invalid 'replyMode' field" });
        return true;
      }

      const replyModeRequested = resolvedReplyMode;
      const directContext =
        resolvedReplyMode === "direct" ? buildDirectReplyContext(parentTask) : null;
      if (resolvedReplyMode === "direct" && !directContext) {
        resolvedReplyMode = "parent";
      }

      const runId = randomUUID();
      const run = {
        runId,
        parentAgentId,
        parentTaskId: parentTask.id || null,
        agentId,
        label: label || null,
        depth: parentDepth + 1,
        status: "running",
        replyMode: resolvedReplyMode,
        replyModeRequested,
        replySource: directContext?.source || null,
        replyChatId: directContext?.chatId ?? null,
        replySender: directContext?.sender ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      subagentRuns.set(runId, run);
      persistSubagentRuns();
      if (resolvedReplyMode === "direct" && directContext) {
        subagentDirectReplies.set(runId, directContext);
      }

      const replyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for subagent response"));
        }, timeoutMs);

        enqueueAgentPrompt(agent, {
          source: "subagent",
          text: task,
          forceNewSession: true,
          subagentRunId: runId,
          subagentDepth: parentDepth + 1,
          onReply: (reply) => {
            clearTimeout(timeout);
            resolve(reply);
          },
        });
      });

      try {
        const reply = await replyPromise;
        run.status = "done";
        run.completedAt = new Date().toISOString();
        run.updatedAt = new Date().toISOString();
        subagentRuns.set(runId, run);
        persistSubagentRuns();
        subagentDirectReplies.delete(runId);
        const replyPayload = resolvedReplyMode === "direct" ? "" : reply;
        sendJson(res, 200, {
          success: true,
          runId,
          reply: replyPayload,
          replyMode: resolvedReplyMode,
        });
      } catch (err) {
        run.status = "failed";
        run.error = err.message;
        run.completedAt = new Date().toISOString();
        run.updatedAt = new Date().toISOString();
        subagentRuns.set(runId, run);
        persistSubagentRuns();
        subagentDirectReplies.delete(runId);
        sendJson(res, 504, { error: err.message, runId });
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
