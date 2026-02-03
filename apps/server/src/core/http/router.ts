import { readBody } from "./utils.js";
import { createHealthRoute } from "./routes/health.js";
import { createModelsRoutes } from "./routes/models.js";
import { createNotifyRoute } from "./routes/notify.js";
import { createPipelineRoute } from "./routes/pipeline.js";
import { createSubagentsRoute } from "./routes/subagents.js";
import { createAskRoute } from "./routes/ask.js";
import { createStaticRoute } from "./routes/static.js";

export const createHttpRouter = ({
  parseRequestUrl,
  isAuthorizedRequest,
  sendUnauthorized,
  resolvePublicFilePath,
  maxBodyBytes,
  notifyLocalOnly,
  agentList,
  defaultAgentId,
  agents,
  getWebChannel,
  formatAgentReply,
  enqueueAgentPrompt,
  readModelsConfig,
  writeModelsConfig,
  getBuiltinProviderCatalog,
  modelsPath,
  restartAgentProcesses,
  runImgPipelineQuery,
  normalizeStringList,
  resolveUserPath,
  guessMimeType,
  imgPipelineMaxTop,
  imgPipelineMaxBytes,
  imgPipelineMaxTotalBytes,
  subagentRuns,
  subagentDirectReplies,
  persistSubagentRuns,
  buildDirectReplyContext,
  randomUUID,
  loongSubagentMaxDepth,
}) => {
  const readRequestBody = (req) => readBody(req, { maxBytes: maxBodyBytes });

  const healthRoute = createHealthRoute({ agentList, defaultAgentId });
  const modelsRoute = createModelsRoutes({
    notifyLocalOnly,
    readBody: readRequestBody,
    readModelsConfig,
    writeModelsConfig,
    getBuiltinProviderCatalog,
    modelsPath,
    restartAgentProcesses,
  });
  const notifyRoute = createNotifyRoute({
    notifyLocalOnly,
    readBody: readRequestBody,
    agents,
    getWebChannel,
    formatAgentReply,
  });
  const pipelineRoute = createPipelineRoute({
    notifyLocalOnly,
    readBody: readRequestBody,
    runImgPipelineQuery,
    normalizeStringList,
    resolveUserPath,
    guessMimeType,
    imgPipelineMaxTop,
    imgPipelineMaxBytes,
    imgPipelineMaxTotalBytes,
  });
  const subagentsRoute = createSubagentsRoute({
    notifyLocalOnly,
    readBody: readRequestBody,
    agents,
    enqueueAgentPrompt,
    buildDirectReplyContext,
    subagentRuns,
    subagentDirectReplies,
    persistSubagentRuns,
    randomUUID,
    loongSubagentMaxDepth,
  });
  const askRoute = createAskRoute({
    readBody: readRequestBody,
    agents,
    defaultAgentId,
    enqueueAgentPrompt,
  });
  const staticRoute = createStaticRoute({ resolvePublicFilePath });

  const handlers = [
    healthRoute,
    modelsRoute,
    notifyRoute,
    pipelineRoute,
    subagentsRoute,
    askRoute,
    staticRoute,
  ];

  return async (req, res) => {
    try {
      const url = parseRequestUrl(req);
      if (!url) {
        res.writeHead(400);
        res.end();
        return;
      }

      if (!isAuthorizedRequest(req, url)) {
        sendUnauthorized(res);
        return;
      }

      for (const handler of handlers) {
        const handled = await handler(req, res, url);
        if (handled) return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[loong] http router error: ${message}`);
      res.writeHead(500);
      res.end();
    }
  };
};
