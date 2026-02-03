import { createServer } from "http";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { createWebChannel } from "./channels/web/index.js";
import { createIMessageChannel } from "./channels/imessage/index.js";
import { createRequestAuthorizer, parseRequestUrl, sendUnauthorized } from "./core/http/auth.js";
import { createPublicFileResolver } from "./core/http/static.js";
import { createHttpRouter } from "./core/http/router.js";
import { createModelsConfigStore } from "./core/models/config.js";
import { getBuiltinProviderCatalog } from "./core/models/catalog.js";
import { createImgPipelineQuery, guessMimeType } from "./core/pipeline/query.js";
import { createSubagentStore } from "./core/subagents/store.js";
import { createDirectReplyHandler } from "./core/subagents/direct-reply.js";
import { normalizeStringList } from "./core/utils/normalize.js";
import { resolveUserPath } from "./core/utils/paths.js";
import { createAgentConfigLoader } from "./core/agent/config.js";
import { createAgentRuntimeFactory } from "./core/agent/runtime.js";
import { ensureWorkspaceScaffold } from "./core/agent/workspace.js";
import { initAgents } from "./core/agent/registry.js";
import { restartAgentProcesses } from "./core/agent/restart.js";
import { createAgentLifecycle } from "./core/agent/lifecycle.js";
import { checkPiInstalled } from "./core/bootstrap/pi-check.js";
import { ensureStateDirs } from "./core/bootstrap/state-dirs.js";
import { logStartupInfo } from "./core/bootstrap/startup.js";
import { createInternalExtensionsResolver } from "./core/extensions/internal.js";
import { loadGatewayConfig } from "./core/config/gateway.js";
import { resolveCommand, isSlashCommandText } from "./core/gateway/commands.js";
import { resolveAgentFromText } from "./core/gateway/router.js";
import { createGatewayHandlers } from "./core/gateway/handlers.js";
import { createSessionManager } from "./core/gateway/sessions.js";
import { createSessionFlow } from "./core/gateway/session-flow.js";
import { createIMessageSessionMap } from "./core/gateway/imessage-session-map.js";
import { extractAssistantText, extractTextBlocks } from "./core/message/extractors.js";
import { createGatewayRuntime } from "./core/gateway/runtime.js";
import { createTaskRunner } from "./core/gateway/tasks.js";
import { createAgentRequest } from "./core/gateway/agent-request.js";
import { createAgentLineHandler } from "./core/gateway/agent-line.js";
import { createAgentResponseHandler } from "./core/gateway/agent-response.js";
import { createAgentEventHandler } from "./core/gateway/agent-events.js";
import { createNotificationHelpers } from "./core/gateway/notifications.js";
import { createAgentUiHandlers } from "./core/gateway/agent-ui.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 17800);
const PI_CMD = process.env.PI_CMD || "pi";
const PI_CWD = process.env.PI_CWD || resolve(__dirname, "..", "..");
const LOONG_STATE_DIR = process.env.LOONG_STATE_DIR || join(homedir(), ".loong");
const LOONG_WORKSPACES_DIR = join(LOONG_STATE_DIR, "workspaces");
const LOONG_SESSIONS_DIR = join(LOONG_STATE_DIR, "sessions");
const LOONG_USERS_DIR = join(LOONG_STATE_DIR, "users");
const LOONG_RUNTIME_DIR = join(LOONG_STATE_DIR, "runtime");
const LOONG_RUNTIME_CHANNELS_DIR = join(LOONG_RUNTIME_DIR, "channels");
const LOONG_RUNTIME_OUTBOUND_DIR = join(LOONG_RUNTIME_DIR, "outbound");
const LOONG_RUNTIME_SUBAGENTS_DIR = join(LOONG_RUNTIME_DIR, "subagents");
const LOONG_CONFIG_PATH = process.env.LOONG_CONFIG_PATH || join(LOONG_STATE_DIR, "config.json");
const PI_MODELS_PATH = process.env.PI_MODELS_PATH || join(homedir(), ".pi", "agent", "models.json");
const LOONG_PASSWORD = process.env.LOONG_PASSWORD || "";
const PASSWORD_REQUIRED = Boolean(LOONG_PASSWORD);
const LOONG_DEBUG = ["1", "true", "yes"].includes(
  String(process.env.LOONG_DEBUG || "").toLowerCase(),
);
const WS_HEARTBEAT_MS = Number(process.env.LOONG_WS_HEARTBEAT_MS || 30000);
const TASK_TIMEOUT_MS = Number(process.env.LOONG_TASK_TIMEOUT_MS || 10 * 60 * 1000);
const SLASH_COMMAND_TIMEOUT_MS = Number(process.env.LOONG_SLASH_COMMAND_TIMEOUT_MS || 0);
const SESSION_CACHE_TTL_MS = Number(process.env.LOONG_SESSION_CACHE_TTL_MS || 3000);
const AGENT_RESTART_MS = Number(process.env.LOONG_AGENT_RESTART_MS || 3000);
const LOONG_SUBAGENT_MAX_DEPTH = Number(process.env.LOONG_SUBAGENT_MAX_DEPTH || 2);
const MAX_BODY_BYTES = (() => {
  const parsed = Number(process.env.LOONG_MAX_BODY_BYTES || 256 * 1024);
  return Number.isFinite(parsed) ? parsed : 256 * 1024;
})();
const NOTIFY_LOCAL_ONLY = !["0", "false", "no"].includes(
  String(process.env.LOONG_NOTIFY_LOCAL_ONLY || "true").toLowerCase(),
);

const IMG_PIPELINE_DIR = process.env.IMG_PIPELINE_DIR || "";
const IMG_PIPELINE_QUERY_CMD =
  process.env.IMG_PIPELINE_QUERY_CMD ||
  (IMG_PIPELINE_DIR ? join(IMG_PIPELINE_DIR, "bin", "query-embed") : "");
const IMG_PIPELINE_DEFAULT_OUTPUT =
  process.env.IMG_PIPELINE_OUTPUT_DIR || join(homedir(), "output");
const IMG_PIPELINE_MAX_TOP = Number(process.env.IMG_PIPELINE_MAX_TOP || 20);
const IMG_PIPELINE_MAX_BYTES = Number(process.env.IMG_PIPELINE_MAX_BYTES || 5 * 1024 * 1024);
const IMG_PIPELINE_MAX_TOTAL_BYTES = Number(
  process.env.IMG_PIPELINE_MAX_TOTAL_BYTES || 20 * 1024 * 1024,
);

const IMESSAGE_ENABLED_ENV = ["1", "true", "yes"].includes(
  String(process.env.IMESSAGE_ENABLED || "").toLowerCase(),
);
const IMESSAGE_DISABLED_ENV = ["0", "false", "no"].includes(
  String(process.env.IMESSAGE_ENABLED || "").toLowerCase(),
);
const IMESSAGE_AUTO = !["0", "false", "no"].includes(
  String(process.env.LOONG_IMESSAGE_AUTO || "true").toLowerCase(),
);
const IMESSAGE_CLI_PATH = process.env.IMESSAGE_CLI_PATH || "imsg";
const DEFAULT_IMESSAGE_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");
const IMESSAGE_DB_PATH = process.env.IMESSAGE_DB_PATH || DEFAULT_IMESSAGE_DB_PATH;
const IMESSAGE_DB_FOUND = existsSync(IMESSAGE_DB_PATH);
const IMESSAGE_ENABLED = IMESSAGE_DISABLED_ENV
  ? false
  : IMESSAGE_ENABLED_ENV || (IMESSAGE_AUTO && IMESSAGE_DB_FOUND);
const IMESSAGE_SERVICE = process.env.IMESSAGE_SERVICE || "auto";
const IMESSAGE_REGION = process.env.IMESSAGE_REGION || "US";
const IMESSAGE_ATTACHMENTS = ["1", "true", "yes"].includes(
  String(process.env.IMESSAGE_ATTACHMENTS || "").toLowerCase(),
);
const IMESSAGE_SESSION_MODE = (process.env.IMESSAGE_SESSION_MODE || "shared").toLowerCase();
const IMESSAGE_PER_CHAT = IMESSAGE_SESSION_MODE === "per-chat";
const IMESSAGE_ALLOWLIST = (process.env.IMESSAGE_ALLOWLIST || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const IMESSAGE_OUTBOUND_DIR =
  process.env.IMESSAGE_OUTBOUND_DIR || join(LOONG_RUNTIME_OUTBOUND_DIR, "imessage");

const DEFAULT_GATEWAY_CONFIG = {
  defaultAgent: null,
  notifyOnStart: true,
  replyPrefixMode: "always",
  keywordMode: "prefix",
};

checkPiInstalled(PI_CMD, console);

const resolveInternalExtensionPaths = createInternalExtensionsResolver({
  baseDir: __dirname,
  resolveUserPath,
  env: process.env,
});

const runImgPipelineQuery = createImgPipelineQuery({
  queryCmd: IMG_PIPELINE_QUERY_CMD,
  defaultOutputDir: IMG_PIPELINE_DEFAULT_OUTPUT,
  resolveUserPath,
  env: process.env,
});

const agentConfigLoader = createAgentConfigLoader({
  loongStateDir: LOONG_STATE_DIR,
  loongWorkspacesDir: LOONG_WORKSPACES_DIR,
  loongSessionsDir: LOONG_SESSIONS_DIR,
  loongRuntimeChannelsDir: LOONG_RUNTIME_CHANNELS_DIR,
  logger: console,
});
const { resolveAgentConfigs, validateAgentNames } = agentConfigLoader;

ensureStateDirs({
  loongStateDir: LOONG_STATE_DIR,
  loongWorkspacesDir: LOONG_WORKSPACES_DIR,
  loongSessionsDir: LOONG_SESSIONS_DIR,
  loongUsersDir: LOONG_USERS_DIR,
  loongRuntimeChannelsDir: LOONG_RUNTIME_CHANNELS_DIR,
  loongRuntimeOutboundDir: LOONG_RUNTIME_OUTBOUND_DIR,
  loongRuntimeSubagentsDir: LOONG_RUNTIME_SUBAGENTS_DIR,
  imessageEnabled: IMESSAGE_ENABLED,
  imessageSessionMapDir: join(LOONG_RUNTIME_CHANNELS_DIR, "imessage", "session-map"),
  imessageOutboundDir: IMESSAGE_OUTBOUND_DIR,
});

const subagentStore = createSubagentStore({
  runtimeDir: LOONG_RUNTIME_SUBAGENTS_DIR,
  logger: console,
});
const {
  runs: subagentRuns,
  directReplies: subagentDirectReplies,
  load: loadSubagentRuns,
  persist: persistSubagentRuns,
} = subagentStore;

loadSubagentRuns();

let handleAgentExit = null;

const piCmdParts = PI_CMD.split(/\s+/).filter(Boolean);
const piCmd = piCmdParts[0];
const piBaseArgs = piCmdParts.slice(1);

const agentRuntimeFactory = createAgentRuntimeFactory({
  piCmd,
  piBaseArgs,
  piCwd: PI_CWD,
  port: PORT,
  resolveInternalExtensionPaths,
  ensureWorkspaceScaffold,
  getHandleAgentLine: () => handleAgentLine,
  getHandleAgentExit: () => handleAgentExit,
  env: process.env,
});

const { createAgentRuntime, spawnAgentProcess } = agentRuntimeFactory;

let webChannel = null;
let imessageChannel = null;
let sessionFlow = null;

const gatewayConfig = loadGatewayConfig({
  configPath: LOONG_CONFIG_PATH,
  defaults: DEFAULT_GATEWAY_CONFIG,
  logger: console,
});
const agents = new Map();
const agentList = [];
const defaultAgentId = initAgents({
  gatewayConfig,
  agents,
  agentList,
  createAgentRuntime,
  resolveAgentConfigs,
  validateAgentNames,
  logger: console,
});

if (!defaultAgentId) {
  console.error("[loong] no agents loaded; check config and agents directory");
  process.exit(1);
}

const publicDir = process.env.LOONG_WEB_DIST || join(__dirname, "..", "..", "web", "dist");

if (!existsSync(publicDir)) {
  console.warn(`[loong] web dist not found: ${publicDir}`);
}

const { isAuthorizedRequest } = createRequestAuthorizer({
  passwordRequired: PASSWORD_REQUIRED,
  password: LOONG_PASSWORD,
});
const resolvePublicFilePath = createPublicFileResolver(publicDir);
const modelsConfigStore = createModelsConfigStore({
  modelsPath: PI_MODELS_PATH,
  logger: console,
});
const { read: readModelsConfig, write: writeModelsConfig } = modelsConfigStore;

const server = createServer(
  createHttpRouter({
    parseRequestUrl,
    isAuthorizedRequest,
    sendUnauthorized,
    resolvePublicFilePath,
    maxBodyBytes: MAX_BODY_BYTES,
    notifyLocalOnly: NOTIFY_LOCAL_ONLY,
    agentList,
    defaultAgentId,
    agents,
    getWebChannel: () => webChannel,
    formatAgentReply: (agent, text) => formatAgentReply(agent, text),
    enqueueAgentPrompt: (agent, task) => enqueueAgentPrompt(agent, task),
    readModelsConfig,
    writeModelsConfig,
    getBuiltinProviderCatalog,
    modelsPath: PI_MODELS_PATH,
    restartAgentProcesses: () => restartAgentProcesses({ agents, logger: console }),
    runImgPipelineQuery,
    normalizeStringList,
    resolveUserPath,
    guessMimeType,
    imgPipelineMaxTop: IMG_PIPELINE_MAX_TOP,
    imgPipelineMaxBytes: IMG_PIPELINE_MAX_BYTES,
    imgPipelineMaxTotalBytes: IMG_PIPELINE_MAX_TOTAL_BYTES,
    subagentRuns,
    subagentDirectReplies,
    persistSubagentRuns,
    buildDirectReplyContext: (task) => buildDirectReplyContext(task),
    randomUUID,
    loongSubagentMaxDepth: LOONG_SUBAGENT_MAX_DEPTH,
  }),
);

const imessageSessionMap = createIMessageSessionMap({
  perChat: IMESSAGE_PER_CHAT,
  logger: console,
});

const {
  resolveKey: resolveIMessageKey,
  loadSessionMap: loadIMessageSessionMap,
  persistSessionMap: persistIMessageSessionMap,
  updateSessionMapping,
  replaceSessionPath: replaceIMessageSessionPath,
  removeSessionPath: removeIMessageSessionPath,
} = imessageSessionMap;

const notifyIMessage = async ({ text, chatId, sender }) => {
  await imessageChannel?.sendText({ text, chatId, sender });
};

let sendGatewayMessage = () => {};
let broadcastAgentStatus = () => {};
const sendGatewayMessageAdapter = (ws, text) => sendGatewayMessage(ws, text);
const broadcastAgentStatusAdapter = (agent) => broadcastAgentStatus(agent);

const {
  resolveAgentLabel,
  formatAgentReply,
  safeNotify,
  notifyTaskMessage,
  notifyBackgroundWebClients,
} = createNotificationHelpers({
  notifyIMessage,
  sendGatewayMessage: (ws, text) => sendGatewayMessageAdapter(ws, text),
  notifyBackground: (agentId, text) => {
    if (webChannel) {
      webChannel.notifyBackground({ agentId, text });
    }
  },
  logger: console,
});

const buildPromptText = (task) => {
  if (sessionFlow?.buildPromptText) {
    return sessionFlow.buildPromptText(task);
  }
  return task?.text || "";
};

const ensureAgentSession = async (agent, task) => {
  if (!sessionFlow?.ensureAgentSession) {
    return agent.currentSessionFile || null;
  }
  return sessionFlow.ensureAgentSession(agent, task);
};

const resolveTaskReply = (task, reply) => {
  if (!task?.onReply || task.replySent) return false;
  task.replySent = true;
  task.onReply(reply);
  return true;
};

const sendIMessageReply = async (agent, task, payload) => {
  await imessageChannel?.sendReply?.(agent, task, payload);
};

const buildDirectReplyContext = (task) => {
  if (!task) return null;
  if (task.source === "imessage") {
    if (task.chatId == null && !task.sender) return null;
    return {
      source: "imessage",
      chatId: task.chatId ?? null,
      sender: task.sender ?? null,
    };
  }
  if (task.source === "web" && task.ws) {
    return { source: "web", ws: task.ws };
  }
  return null;
};

let completeCurrentTaskFn = () => {};

const { handleExtensionUiRequest, createGatewaySender } = createAgentUiHandlers({
  formatAgentReply,
  notifyIMessage,
  safeNotify,
  sendGatewayMessage: (ws, text) => sendGatewayMessageAdapter(ws, text),
  broadcastGatewayMessage: (payload) => {
    if (webChannel) {
      webChannel.broadcastGatewayMessage(payload);
    }
  },
  completeCurrentTask: (agent, task, options) => completeCurrentTaskFn(agent, task, options),
});

let handleAgentEvent = null;

const deliverSubagentDirectReply = createDirectReplyHandler({
  subagentDirectReplies,
  dependencies: {
    notifyIMessage,
    sendGatewayMessage: (ws, text) => sendGatewayMessageAdapter(ws, text),
    formatAgentReply,
    safeNotify,
    sendIMessageReply,
    logger: console,
  },
});

const sendToPi = (agent, payload) => {
  if (agent.offline) return;
  try {
    agent.pi.stdin.write(`${JSON.stringify(payload)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[loong] send to agent ${agent.id} failed: ${message}`);
    void handleAgentExit?.(agent, `send error: ${message}`);
  }
};

const sendAgentRequest = createAgentRequest({ sendToAgent: sendToPi });

const taskRunner = createTaskRunner({
  taskTimeoutMs: TASK_TIMEOUT_MS,
  slashCommandTimeoutMs: SLASH_COMMAND_TIMEOUT_MS,
  createTaskId: randomUUID,
  isSlashCommandText,
  sendAgentRequest,
  sendToAgent: sendToPi,
  ensureAgentSession,
  buildPromptText,
  notifyTaskMessage,
  broadcastAgentStatus: broadcastAgentStatusAdapter,
  subagentRuns,
  persistSubagentRuns,
});

const {
  enqueueAgentPrompt,
  completeCurrentTask,
  failCurrentTask,
  clearTaskTimeout,
  clearSlashCommandTimer,
} = taskRunner;
completeCurrentTaskFn = completeCurrentTask;

const { handleAgentExit: lifecycleHandleAgentExit } = createAgentLifecycle({
  agentRestartMs: AGENT_RESTART_MS,
  spawnAgentProcess,
  failCurrentTask,
  broadcastAgentStatus: broadcastAgentStatusAdapter,
});
handleAgentExit = lifecycleHandleAgentExit;

const handleAgentResponse = createAgentResponseHandler();

handleAgentEvent = createAgentEventHandler({
  handleExtensionUiRequest,
  clearSlashCommandTimer,
  clearTaskTimeout,
  resolveTaskReply,
  completeCurrentTask,
  deliverSubagentDirectReply,
  extractTextBlocks,
  extractAssistantText,
  sendIMessageReply,
  notifyBackgroundWebClients,
});

const handleAgentLine = createAgentLineHandler({
  handleAgentResponse,
  handleAgentEvent,
  broadcastAgentPayload: (agentId, line) => {
    if (webChannel) {
      webChannel.broadcastAgentPayload(agentId, line);
    }
  },
  debug: LOONG_DEBUG,
});

const sessionManager = createSessionManager({
  sessionCacheTtlMs: SESSION_CACHE_TTL_MS,
  sendAgentRequest,
  onSessionRenamed: (agent, fromPath, toPath) =>
    replaceIMessageSessionPath(agent, fromPath, toPath),
  onSessionDeleted: (agent, targetPath) => removeIMessageSessionPath(agent, targetPath),
});

const { createSessionPath, relocateSessionFile, upsertSessionIndexEntry } = sessionManager;

sessionFlow = createSessionFlow({
  sendAgentRequest,
  createSessionPath,
  relocateSessionFile,
  upsertSessionIndexEntry,
  imessagePerChat: IMESSAGE_PER_CHAT,
  resolveIMessageKey,
  persistIMessageSessionMap,
});

const { handleGatewayCommand } = createGatewayHandlers({
  sendAgentRequest,
  createSessionPath,
  relocateSessionFile,
  upsertSessionIndexEntry,
  updateSessionMapping,
});

const gatewayRuntime = createGatewayRuntime({
  agents,
  defaultAgentId,
  sessionManager,
  resolveAgentFromText,
  resolveCommand,
  handleGatewayCommand,
  enqueueAgentPrompt,
  sendAgentRequest,
  sendToAgent: sendToPi,
});

imessageChannel = createIMessageChannel({
  enabled: IMESSAGE_ENABLED,
  cliPath: IMESSAGE_CLI_PATH,
  dbPath: IMESSAGE_DB_PATH,
  attachments: IMESSAGE_ATTACHMENTS,
  service: IMESSAGE_SERVICE,
  region: IMESSAGE_REGION,
  allowlist: IMESSAGE_ALLOWLIST,
  outboundDir: IMESSAGE_OUTBOUND_DIR,
  defaultAgentId,
  isSlashCommandText,
  resolveAgentLabel,
  formatAgentReply,
  extractAssistantText,
  resolveContextKey: resolveIMessageKey,
  gateway: gatewayRuntime,
  logger: console,
});

webChannel = createWebChannel({
  server,
  path: "/ws",
  passwordRequired: PASSWORD_REQUIRED,
  isAuthorizedRequest,
  wsHeartbeatMs: WS_HEARTBEAT_MS,
  agentList,
  defaultAgentId,
  loongState: LOONG_STATE_DIR,
  loongWorkspaces: LOONG_WORKSPACES_DIR,
  loongSessions: LOONG_SESSIONS_DIR,
  loongRuntime: LOONG_RUNTIME_DIR,
  gateway: gatewayRuntime,
});

const gatewaySender = createGatewaySender(webChannel);
sendGatewayMessage = gatewaySender.sendGatewayMessage;
broadcastAgentStatus = gatewaySender.broadcastAgentStatus;

if (IMESSAGE_ENABLED) {
  for (const agent of agents.values()) {
    loadIMessageSessionMap(agent);
  }
  imessageChannel
    ?.start()
    .then(() => {
      console.log("[loong] imessage bridge ready");
    })
    .catch((err) => {
      console.error(`[loong] imessage bridge failed: ${err.message}`);
    });
}

server.listen(PORT, () => {
  const modeLabel = IMESSAGE_ENABLED_ENV ? "explicit" : "auto";
  const disabledReason = IMESSAGE_DISABLED_ENV
    ? "disabled via IMESSAGE_ENABLED=0"
    : IMESSAGE_AUTO && !IMESSAGE_DB_FOUND
      ? `chat.db not found at ${IMESSAGE_DB_PATH}`
      : "set IMESSAGE_ENABLED=1 or LOONG_IMESSAGE_AUTO=1 to enable";

  logStartupInfo({
    logger: console,
    port: PORT,
    stateDir: LOONG_STATE_DIR,
    agents: agentList,
    imessageEnabled: IMESSAGE_ENABLED,
    imessageInfo: {
      modeLabel,
      cliPath: IMESSAGE_CLI_PATH,
      dbPath: IMESSAGE_DB_PATH,
    },
    imessageDisabledReason: disabledReason,
  });
});
