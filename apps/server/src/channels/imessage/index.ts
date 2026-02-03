import { mkdirSync } from "fs";
import { startIMessageBridge } from "../../imessage.js";
import { createIMessageOutbound } from "./outbound.js";
import { createIMessageInbound } from "./inbound.js";

export const createIMessageChannel = ({
  enabled = false,
  cliPath = "imsg",
  dbPath,
  attachments = false,
  service = "auto",
  region = "US",
  allowlist = [],
  outboundDir,
  defaultAgentId,
  isSlashCommandText,
  resolveAgentLabel,
  formatAgentReply,
  extractAssistantText,
  resolveContextKey,
  gateway = {},
  logger = console,
} = {}) => {
  const { resolveAgentFromText, resolveCommand, handleGatewayCommand, enqueueAgentPrompt } =
    gateway;

  let bridge = null;

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
  });

  const start = async () => {
    if (!enabled) return null;
    ensureOutboundDir();
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
