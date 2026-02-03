import { createMediaHelpers } from "./media.js";

export const createIMessageOutbound = ({
  getBridge,
  outboundDir,
  ensureOutboundDir,
  service = "auto",
  region = "US",
  formatAgentReply,
  extractAssistantText,
  logger = console,
} = {}) => {
  const { writeOutboundMediaFile, resolveMediaPlaceholder, collectOutboundMedia } =
    createMediaHelpers({ outboundDir, ensureOutboundDir });

  const resolveBridge = () => (typeof getBridge === "function" ? getBridge() : null);

  const sendText = async ({ text, chatId, sender }) => {
    const bridge = resolveBridge();
    if (!bridge) return;
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    if (chatId == null && !sender) return;
    await bridge.sendMessage({
      text: trimmed,
      chatId,
      to: sender,
      service,
      region,
    });
  };

  const safeSendText = async ({ text, chatId, sender, errorLabel = "notify failed" } = {}) => {
    try {
      await sendText({ text, chatId, sender });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error?.(`[loong] ${errorLabel}: ${message}`);
      return false;
    }
  };

  const sendMedia = async ({ media, chatId, sender }) => {
    const bridge = resolveBridge();
    if (!bridge) return;
    const filePath = writeOutboundMediaFile(media);
    if (!filePath) return;
    const placeholder = resolveMediaPlaceholder(media.mimeType);
    await bridge.sendMessage({
      text: placeholder,
      file: filePath,
      chatId,
      to: sender,
      service,
      region,
    });
  };

  const sendReply = async (agent, task, payload) => {
    const bridge = resolveBridge();
    if (!bridge || !task) return;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const reply = extractAssistantText ? extractAssistantText(messages) : "";
    const baseIndex = Number.isInteger(task.baseMessageCount) ? task.baseMessageCount : null;
    const newMessages = baseIndex != null ? messages.slice(baseIndex) : messages;
    const mediaItems = collectOutboundMedia(newMessages);
    const chatId = task.chatId;
    const sender = task.sender;

    if (reply.trim()) {
      const formatted = formatAgentReply ? formatAgentReply(agent, reply) : reply;
      await bridge.sendMessage({
        text: formatted,
        chatId,
        to: sender,
        service,
        region,
      });
    }

    for (const media of mediaItems) {
      try {
        await sendMedia({ media, chatId, sender });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error?.(`[loong] imessage media send failed: ${message}`);
      }
    }
  };

  return { sendText, safeSendText, sendReply };
};
