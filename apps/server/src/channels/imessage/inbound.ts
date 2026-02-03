const defaultResolveContextKey = ({ chatId, sender }) => {
  if (chatId != null) return `chat:${chatId}`;
  if (sender) return `sender:${sender}`;
  return "unknown";
};

const createFallbackSafeSend = ({ sendText, logger }) => {
  return async ({ text, chatId, sender, errorLabel = "notify failed" } = {}) => {
    try {
      await sendText?.({ text, chatId, sender });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error?.(`[loong] ${errorLabel}: ${message}`);
      return false;
    }
  };
};

export const createIMessageInbound = ({
  enabled = false,
  defaultAgentId,
  allowlist = [],
  resolveContextKey = defaultResolveContextKey,
  resolveAgentFromText,
  resolveCommand,
  handleGatewayCommand,
  enqueueAgentPrompt,
  sendText,
  safeSendText,
  resolveAgentLabel,
  isSlashCommandText,
  logger = console,
} = {}) => {
  const contexts = new Map();
  const safeSend = safeSendText || createFallbackSafeSend({ sendText, logger });

  const isAuthorized = (sender) => {
    if (!allowlist || allowlist.length === 0) return true;
    if (!sender) return false;
    return allowlist.includes(sender);
  };

  const sendProcessingNotice = async (agent, { chatId, sender, text }) => {
    if (!agent?.notifyOnStart) return;
    const trimmed = typeof text === "string" ? text.trim() : "";
    const isSlash = isSlashCommandText ? isSlashCommandText(trimmed) : false;
    const hint = trimmed && isSlash ? `已收到命令 ${trimmed}` : "正在处理...";
    const prefix = resolveAgentLabel ? resolveAgentLabel(agent) : "";
    const notice = `${prefix} ${hint}`.trim();
    await safeSend({ text: notice, chatId, sender, errorLabel: "notify failed" });
  };

  const handleIncoming = async (message) => {
    if (!enabled) return;
    if (!message) return;
    if (message.is_from_me) return;
    const text = message.text?.trim();
    if (!text) return;

    const sender = message.sender ?? undefined;
    if (!isAuthorized(sender)) {
      logger.log?.(`[loong] ignoring message from unauthorized sender: ${sender}`);
      return;
    }
    const chatId = message.chat_id ?? undefined;
    const contextKey = resolveContextKey({ sender, chatId });
    const context = contexts.get(contextKey);
    const currentAgentId = context?.agentId || defaultAgentId;
    const resolved = resolveAgentFromText?.(text, currentAgentId) || {};
    const { agent, remainder, switched } = resolved;
    if (!agent) return;

    if (switched) {
      contexts.set(contextKey, { agentId: agent.id });
    }

    const trimmed = (remainder || "").trim();
    const respond = (replyText) => sendText?.({ text: replyText, chatId, sender });
    if (!trimmed) {
      await respond(`已切换到 ${agent.name}`);
      return;
    }

    const command = resolveCommand?.(trimmed);
    const handled = command
      ? await handleGatewayCommand?.({
          agent,
          command,
          respond: (replyText) => respond(replyText),
          sendPrompt: (promptText) =>
            enqueueAgentPrompt?.(agent, {
              source: "imessage",
              text: promptText,
              sender,
              chatId,
              onStart: () => sendProcessingNotice(agent, { chatId, sender, text: promptText }),
            }),
          contextKey,
        })
      : false;
    if (handled) return;

    enqueueAgentPrompt?.(agent, {
      source: "imessage",
      text: trimmed,
      sender,
      chatId,
      onStart: () => sendProcessingNotice(agent, { chatId, sender, text: trimmed }),
    });
  };

  return { handleIncoming };
};
