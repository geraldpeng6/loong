import type { IncomingMessage, ServerResponse } from "http";
import { readBody } from "./utils.js";
import { createHealthRoute } from "./routes/health.js";
import { createModelsRoutes } from "./routes/models.js";
import { createNotifyRoute } from "./routes/notify.js";
import { createPipelineRoute } from "./routes/pipeline.js";
import { createSubagentsRoute } from "./routes/subagents.js";
import { createAskRoute } from "./routes/ask.js";
import { createStaticRoute } from "./routes/static.js";
import { createUploadRoute } from "./routes/upload.js";
import type { FileStorageService, FileUploadConfig } from "../files/types.js";
import type { AttachmentReference } from "../files/types.js";

type AgentSummary = {
  id: string;
  name?: string;
  keywords?: string[];
  busy?: boolean;
  queue?: Array<unknown>;
};

type AgentRuntime = AgentSummary & {
  currentSessionFile?: string | null;
  sessionCache?: unknown;
};

type WebChannel = {
  broadcastGatewayMessage: (payload: {
    scope?: "all" | "agent";
    agentId?: string | null;
    text: string;
  }) => number;
};

export interface CreateHttpRouterOptions {
  parseRequestUrl: (req: IncomingMessage) => URL | null;
  isAuthorizedRequest: (req: IncomingMessage, url: URL) => boolean;
  sendUnauthorized: (res: ServerResponse) => void;
  resolvePublicFilePath: (pathname: string) => string | null;
  maxBodyBytes: number;
  notifyLocalOnly: boolean;
  agentList: AgentSummary[];
  defaultAgentId: string;
  agents: Map<string, AgentRuntime>;
  getWebChannel: () => WebChannel | null;
  formatAgentReply: (agent: AgentRuntime, text: string) => string;
  enqueueAgentPrompt: (
    agent: AgentRuntime,
    task: { source: string; text: string; ws?: unknown; attachments?: AttachmentReference[] },
  ) => void;
  readModelsConfig: () => unknown;
  writeModelsConfig: (config: unknown) => void;
  getBuiltinProviderCatalog: () => unknown;
  modelsPath: string;
  restartAgentProcesses: () => void;
  runImgPipelineQuery: (payload: Record<string, unknown>) => Promise<unknown>;
  normalizeStringList: (value: unknown) => string[];
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  guessMimeType: (fileName: string) => string;
  imgPipelineMaxTop: number;
  imgPipelineMaxBytes: number;
  imgPipelineMaxTotalBytes: number;
  subagentRuns: Map<string, unknown>;
  subagentDirectReplies: Map<string, unknown>;
  persistSubagentRuns: () => void;
  buildDirectReplyContext: (task: unknown) => unknown;
  randomUUID: () => string;
  loongSubagentMaxDepth: number;
  fileStorage?: FileStorageService | null;
  fileUploadConfig?: FileUploadConfig | null;
  passwordRequired?: boolean;
}

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
  fileStorage = null,
  fileUploadConfig = null,
  passwordRequired = false,
}: CreateHttpRouterOptions) => {
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

  // 文件上传路由
  const uploadRoute =
    fileStorage && fileUploadConfig
      ? createUploadRoute({
          fileStorage,
          config: fileUploadConfig,
          localOnly: notifyLocalOnly,
          passwordRequired,
          isAuthorizedRequest: (req) =>
            isAuthorizedRequest(req, new URL(req.url || "", `http://${req.headers.host}`)),
        })
      : null;

  const handlers = [
    healthRoute,
    modelsRoute,
    notifyRoute,
    pipelineRoute,
    subagentsRoute,
    askRoute,
    uploadRoute,
    staticRoute,
  ].filter(Boolean);

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
