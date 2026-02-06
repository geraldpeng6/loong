import type { IncomingMessage, ServerResponse } from "http";
import { readBody } from "./utils.js";
import { createHealthRoute } from "./routes/health.js";
import { createModelsRoutes } from "./routes/models.js";
import { createNotifyRoute } from "./routes/notify.js";
import { createSubagentsRoute } from "./routes/subagents.js";
import { createAskRoute } from "./routes/ask.js";
import { createStaticRoute } from "./routes/static.js";
import { createUploadRoute } from "./routes/upload.js";
import { createPluginsRoute, type PluginStatus } from "./routes/plugins.js";
import { createSetupRoute } from "./routes/setup.js";
import type { RouteHandler } from "./types.js";
import type { FileStorageService, FileUploadConfig } from "../files/types.js";
import type { AttachmentReference } from "../files/types.js";
import type { PasswordSnapshot } from "../auth/password-store.js";

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

type PasswordResult =
  | { ok: true; snapshot: PasswordSnapshot }
  | { ok: false; status: number; error: string };

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
    task: {
      source: string;
      text: string;
      ws?: unknown;
      attachments?: AttachmentReference[];
      forceNewSession?: boolean;
    },
  ) => void;
  scheduleReboot?: (params: {
    reason?: string;
    source?: string;
    requester?: string;
    agentId?: string;
  }) => {
    ok: boolean;
    message: string;
    scheduledAt?: string;
    alreadyScheduled?: boolean;
  };
  readModelsConfig: () => unknown;
  writeModelsConfig: (config: unknown) => { ok: boolean; error?: string };
  getBuiltinProviderCatalog: () => unknown;
  modelsPath: string;
  restartAgentProcesses: () => void;
  getPasswordSnapshot: () => PasswordSnapshot;
  registerPassword: (payload: { username: string; password: string }) => PasswordResult;
  updatePassword: (payload: {
    currentPassword?: string;
    nextPassword: string;
    username?: string;
  }) => PasswordResult;
  isPasswordRequired?: () => boolean;
  extraRoutes?: RouteHandler[];
  subagentRuns: Map<string, unknown>;
  subagentDirectReplies: Map<string, unknown>;
  persistSubagentRuns: () => void;
  buildDirectReplyContext: (task: unknown) => unknown;
  randomUUID: () => string;
  loongSubagentMaxDepth: number;
  fileStorage?: FileStorageService | null;
  fileUploadConfig?: FileUploadConfig | null;
  plugins?: PluginStatus[];
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
  scheduleReboot,
  readModelsConfig,
  writeModelsConfig,
  getBuiltinProviderCatalog,
  modelsPath,
  restartAgentProcesses,
  getPasswordSnapshot,
  registerPassword,
  updatePassword,
  isPasswordRequired,
  extraRoutes = [],
  subagentRuns,
  subagentDirectReplies,
  persistSubagentRuns,
  buildDirectReplyContext,
  randomUUID,
  loongSubagentMaxDepth,
  fileStorage = null,
  fileUploadConfig = null,
  plugins = [],
}: CreateHttpRouterOptions) => {
  const readRequestBody = (req) => readBody(req, { maxBytes: maxBodyBytes });

  const healthRoute = createHealthRoute({ agentList, defaultAgentId });
  const pluginsRoute = createPluginsRoute({ notifyLocalOnly, plugins });
  const modelsRoute = createModelsRoutes({
    notifyLocalOnly,
    readBody: readRequestBody,
    readModelsConfig,
    writeModelsConfig,
    getBuiltinProviderCatalog,
    modelsPath,
    restartAgentProcesses,
  });
  const setupRoute = createSetupRoute({
    notifyLocalOnly,
    readBody: readRequestBody,
    isAuthorizedRequest,
    getPasswordSnapshot,
    registerPassword,
    updatePassword,
    readModelsConfig,
    getBuiltinProviderCatalog,
  });
  const notifyRoute = createNotifyRoute({
    notifyLocalOnly,
    readBody: readRequestBody,
    agents,
    getWebChannel,
    formatAgentReply,
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
    scheduleReboot,
  });
  const staticRoute = createStaticRoute({ resolvePublicFilePath });

  // 文件上传路由
  const uploadRoute =
    fileStorage && fileUploadConfig
      ? createUploadRoute({
          fileStorage,
          config: fileUploadConfig,
          localOnly: notifyLocalOnly,
          isPasswordRequired,
          isAuthorizedRequest: (req) =>
            isAuthorizedRequest(req, new URL(req.url || "", `http://${req.headers.host}`)),
        })
      : null;

  const handlers = [
    healthRoute,
    setupRoute,
    pluginsRoute,
    modelsRoute,
    notifyRoute,
    subagentsRoute,
    askRoute,
    uploadRoute,
    ...extraRoutes,
    staticRoute,
  ].filter(Boolean);

  const isSetupApi = (pathname: string) => pathname.startsWith("/api/setup/");
  const isProtectedApi = (pathname: string) =>
    pathname.startsWith("/api/") && !isSetupApi(pathname);

  return async (req, res) => {
    try {
      const url = parseRequestUrl(req);
      if (!url) {
        res.writeHead(400);
        res.end();
        return;
      }

      if (isProtectedApi(url.pathname) && !isAuthorizedRequest(req, url)) {
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
