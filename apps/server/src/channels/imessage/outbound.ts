import { createMediaHelpers } from "./media.js";

export const createIMessageOutbound = ({
  getBridge,
  outboundDir,
  ensureOutboundDir,
  service = "auto",
  region = "US",
  formatAgentReply,
  extractAssistantText,
  recordOutboundText,
  logger = console,
} = {}) => {
  const { writeOutboundMediaFile, resolveMediaPlaceholder, collectOutboundMedia } =
    createMediaHelpers({ outboundDir, ensureOutboundDir });

  const resolveBridge = () => (typeof getBridge === "function" ? getBridge() : null);

  const parseStructuredError = (parsed) => {
    if (!parsed || typeof parsed !== "object") return "";

    const detailCode = typeof parsed?.detail?.code === "string" ? parsed.detail.code.trim() : "";
    if (detailCode) return `处理失败：${detailCode}`;

    const detailMessage =
      typeof parsed?.detail?.message === "string" ? parsed.detail.message.trim() : "";
    if (detailMessage) return `处理失败：${detailMessage}`;

    const errorType = typeof parsed?.error?.type === "string" ? parsed.error.type.trim() : "";
    const errorMessage =
      typeof parsed?.error?.message === "string" ? parsed.error.message.trim() : "";
    if (errorType && errorMessage) return `处理失败：${errorType} - ${errorMessage}`;
    if (errorMessage) return `处理失败：${errorMessage}`;
    if (errorType) return `处理失败：${errorType}`;

    const code = typeof parsed?.code === "string" ? parsed.code.trim() : "";
    const message = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    if (code && message) return `处理失败：${code} - ${message}`;
    if (message) return `处理失败：${message}`;
    if (code) return `处理失败：${code}`;

    return "";
  };

  const parseErrorText = (raw) => {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      const structured = parseStructuredError(parsed);
      if (structured) return structured;
    } catch {
      // Keep raw text as fallback when errorMessage is not JSON.
    }
    return `处理失败：${trimmed}`;
  };

  const extractAssistantErrorText = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) return "";
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (!message || message.role !== "assistant") continue;
      if (message.stopReason !== "error") continue;
      const raw = typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
      return parseErrorText(raw) || "处理失败：模型返回错误。";
    }
    return "";
  };

  const extractPayloadErrorText = (payload) => {
    if (!payload || typeof payload !== "object") return "";

    const candidates = [payload.errorMessage, payload.error, payload.reason, payload.message];
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const parsed = parseErrorText(candidate);
        if (parsed) return parsed;
        continue;
      }
      if (candidate && typeof candidate === "object") {
        const parsed = parseStructuredError(candidate);
        if (parsed) return parsed;
      }
    }

    return "";
  };

  const sendText = async ({ text, chatId, sender }) => {
    const bridge = resolveBridge();
    if (!bridge) return;
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    if (chatId == null && !sender) return;
    recordOutboundText?.({ text: trimmed, chatId, sender });
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
    const errorReply = extractAssistantErrorText(messages);
    const baseIndex = Number.isInteger(task.baseMessageCount) ? task.baseMessageCount : null;
    const newMessages = baseIndex != null ? messages.slice(baseIndex) : messages;
    const mediaItems = collectOutboundMedia(newMessages);
    const payloadErrorReply = extractPayloadErrorText(payload);
    const finalReply = reply.trim() ? reply : errorReply;
    const fallbackReply =
      payloadErrorReply || "处理失败：模型服务异常，未返回可用内容，请稍后重试。";
    const finalText = finalReply.trim() ? finalReply : mediaItems.length === 0 ? fallbackReply : "";
    const chatId = task.chatId;
    const sender = task.sender;

    if (finalText.trim()) {
      const formatted = formatAgentReply ? formatAgentReply(agent, finalText) : finalText;
      const trimmed = formatted.trim();
      if (trimmed) {
        recordOutboundText?.({ text: trimmed, chatId, sender });
      }
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
