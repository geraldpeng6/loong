import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { startIMessageBridge } from "../../imessage.js";
import { createIMessageOutbound } from "./outbound.js";
import { createIMessageInbound } from "./inbound.js";
import type { AttachmentReference, FileStorageService } from "../../core/files/types.js";

type AgentRuntime = {
  id: string;
  name?: string;
  notifyOnStart?: boolean;
  replyPrefixMode?: string;
};

type GatewayCommand = { type: string; remainder: string };

type GatewayRuntime = {
  resolveAgentFromText?: (
    text: string,
    currentAgentId: string,
  ) => {
    agent: AgentRuntime | null;
    remainder: string;
    switched: boolean;
  } | null;
  resolveCommand?: (text: string) => GatewayCommand | null;
  handleGatewayCommand?: (params: {
    agent: AgentRuntime;
    command: GatewayCommand;
    respond: (replyText: string) => void;
    sendPrompt: (promptText: string) => void;
    contextKey: string;
  }) => Promise<boolean>;
  enqueueAgentPrompt?: (
    agent: AgentRuntime,
    task: {
      source: string;
      text: string;
      sender?: string;
      chatId?: number;
      attachments?: AttachmentReference[];
      onStart?: () => void | Promise<void>;
    },
  ) => void;
};

type IMessageBridge = {
  subscribe: (params: { attachments?: boolean }) => Promise<void>;
  sendMessage: (params: {
    text?: string;
    file?: string;
    chatId?: number;
    to?: string;
    service?: string;
    region?: string;
  }) => Promise<void>;
  stop: () => Promise<void>;
};

export interface CreateIMessageChannelOptions {
  enabled?: boolean;
  cliPath?: string;
  dbPath?: string;
  attachments?: boolean;
  service?: string;
  region?: string;
  allowlist?: string[];
  outboundDir?: string;
  outboundCleanupIntervalMs?: number;
  outboundMaxAgeMs?: number;
  defaultAgentId?: string;
  isSlashCommandText?: (text: string) => boolean;
  resolveAgentLabel?: (agent: AgentRuntime) => string;
  formatAgentReply?: (agent: AgentRuntime, text: string) => string;
  extractAssistantText?: (messages: unknown[]) => string;
  resolveContextKey?: (params: { chatId?: number; sender?: string }) => string;
  gateway?: GatewayRuntime;
  logger?: Console;
  fileStorage?: FileStorageService | null;
  publicBaseUrl?: string;
}

export const createIMessageChannel = ({
  enabled = false,
  cliPath = "imsg",
  dbPath,
  attachments = false,
  service = "auto",
  region = "US",
  allowlist = [],
  outboundDir,
  outboundCleanupIntervalMs,
  outboundMaxAgeMs,
  defaultAgentId,
  isSlashCommandText,
  resolveAgentLabel,
  formatAgentReply,
  extractAssistantText,
  resolveContextKey,
  gateway = {},
  logger = console,
  fileStorage = null,
  publicBaseUrl = "",
}: CreateIMessageChannelOptions = {}) => {
  const { resolveAgentFromText, resolveCommand, handleGatewayCommand, enqueueAgentPrompt } =
    gateway;

  let bridge: IMessageBridge | null = null;
  let cleanupTimer: NodeJS.Timeout | null = null;

  const cleanupOutboundDir = () => {
    if (!outboundDir) return;
    if (!outboundMaxAgeMs || outboundMaxAgeMs <= 0) return;

    try {
      const now = Date.now();
      const entries = readdirSync(outboundDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = join(outboundDir, entry.name);
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > outboundMaxAgeMs) {
          unlinkSync(filePath);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] imessage outbound cleanup failed: ${message}`);
    }
  };

  const scheduleCleanup = () => {
    if (!outboundDir) return;
    if (!outboundCleanupIntervalMs || outboundCleanupIntervalMs <= 0) return;
    if (!outboundMaxAgeMs || outboundMaxAgeMs <= 0) return;
    if (cleanupTimer) return;
    cleanupOutboundDir();
    cleanupTimer = setInterval(cleanupOutboundDir, outboundCleanupIntervalMs);
  };

  const stopCleanup = () => {
    if (!cleanupTimer) return;
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  };

  const ensureOutboundDir = () => {
    if (!outboundDir) return;
    mkdirSync(outboundDir, { recursive: true });
  };

  const outbound = createIMessageOutbound({
    getBridge: () => bridge,
    outboundDir,
    ensureOutboundDir,
    service,
    region,
    formatAgentReply,
    extractAssistantText,
    logger,
  });

  const inbound = createIMessageInbound({
    enabled,
    defaultAgentId,
    allowlist,
    resolveContextKey,
    resolveAgentFromText,
    resolveCommand,
    handleGatewayCommand,
    enqueueAgentPrompt,
    sendText: outbound.sendText,
    safeSendText: outbound.safeSendText,
    resolveAgentLabel,
    isSlashCommandText,
    logger,
    fileStorage,
    publicBaseUrl,
  });

  const start = async () => {
    if (!enabled) return null;
    ensureOutboundDir();
    scheduleCleanup();
    bridge = await startIMessageBridge({
      cliPath,
      dbPath,
      runtime: logger,
      onMessage: inbound.handleIncoming,
    });
    await bridge.subscribe({ attachments });
    return bridge;
  };

  const stop = async () => {
    stopCleanup();
    if (!bridge) return;
    await bridge.stop();
    bridge = null;
  };

  return {
    start,
    stop,
    sendText: outbound.sendText,
    safeSendText: outbound.safeSendText,
    sendReply: outbound.sendReply,
  };
};
