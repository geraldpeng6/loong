import type { AttachmentReference, FileStorageService } from "../../core/files/types.js";
import { createFileMetadata } from "../../core/files/storage.js";
import { inferMimeTypeFromExtension } from "../../core/files/validation.js";

type AgentRuntime = {
  id: string;
  name?: string;
  notifyOnStart?: boolean;
};

type GatewayCommand = { type: string; remainder: string };

type ResolvedAgent = {
  agent: AgentRuntime | null;
  remainder: string;
  switched: boolean;
};

type GatewayTask = {
  source: "imessage";
  text: string;
  sender?: string;
  chatId?: number;
  attachments?: AttachmentReference[];
  onStart?: () => void | Promise<void>;
};

type SafeSendParams = {
  text?: string;
  chatId?: number;
  sender?: string;
  errorLabel?: string;
};

type IMessageAttachment = {
  file_path?: string;
  file_name?: string;
  mime_type?: string;
};

type IMessageMessage = {
  is_from_me?: boolean;
  text?: string;
  sender?: string;
  chat_id?: number;
  attachments?: IMessageAttachment[];
};

const defaultResolveContextKey = ({ chatId, sender }: { chatId?: number; sender?: string }) => {
  if (chatId != null) return `chat:${chatId}`;
  if (sender) return `sender:${sender}`;
  return "unknown";
};

const createFallbackSafeSend = ({
  sendText,
  logger,
}: {
  sendText?: (params: { text: string; chatId?: number; sender?: string }) => Promise<void>;
  logger: Console;
}) => {
  return async ({ text, chatId, sender, errorLabel = "notify failed" }: SafeSendParams = {}) => {
    try {
      if (!text) return false;
      await sendText?.({ text, chatId, sender });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error?.(`[loong] ${errorLabel}: ${message}`);
      return false;
    }
  };
};

export interface CreateIMessageInboundOptions {
  enabled?: boolean;
  defaultAgentId?: string;
  allowlist?: string[];
  resolveContextKey?: (params: { chatId?: number; sender?: string }) => string;
  resolveAgentFromText?: (text: string, currentAgentId: string) => ResolvedAgent | null;
  resolveCommand?: (text: string) => GatewayCommand | null;
  handleGatewayCommand?: (params: {
    agent: AgentRuntime;
    command: GatewayCommand;
    respond: (replyText: string) => void;
    sendPrompt: (promptText: string) => void;
    contextKey: string;
  }) => Promise<boolean>;
  enqueueAgentPrompt?: (agent: AgentRuntime, task: GatewayTask) => void;
  sendText?: (params: { text: string; chatId?: number; sender?: string }) => Promise<void>;
  safeSendText?: (params: SafeSendParams) => Promise<boolean>;
  resolveAgentLabel?: (agent: AgentRuntime) => string;
  isSlashCommandText?: (text: string) => boolean;
  logger?: Console;
  fileStorage?: FileStorageService | null;
  publicBaseUrl?: string;
}

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
  fileStorage = null,
  publicBaseUrl = "",
}: CreateIMessageInboundOptions = {}) => {
  const contexts = new Map<string, { agentId: string }>();
  const safeSend = safeSendText || createFallbackSafeSend({ sendText, logger });

  const isAuthorized = (sender?: string) => {
    if (!allowlist || allowlist.length === 0) return true;
    if (!sender) return false;
    return allowlist.includes(sender);
  };

  const sendProcessingNotice = async (
    agent: AgentRuntime,
    { chatId, sender, text }: { chatId?: number; sender?: string; text: string },
  ) => {
    if (!agent?.notifyOnStart) return;
    const trimmed = typeof text === "string" ? text.trim() : "";
    const isSlash = isSlashCommandText ? isSlashCommandText(trimmed) : false;
    const hint = trimmed && isSlash ? `已收到命令 ${trimmed}` : "正在处理...";
    const prefix = resolveAgentLabel ? resolveAgentLabel(agent) : "";
    const notice = `${prefix} ${hint}`.trim();
    await safeSend({ text: notice, chatId, sender, errorLabel: "notify failed" });
  };

  /**
   * 处理 iMessage 入站附件
   * 将附件保存到文件存储并返回附件引用
   */
  const processAttachments = async (message: IMessageMessage): Promise<AttachmentReference[]> => {
    if (!fileStorage) return [];
    if (
      !message.attachments ||
      !Array.isArray(message.attachments) ||
      message.attachments.length === 0
    ) {
      return [];
    }

    const attachments: AttachmentReference[] = [];

    for (const att of message.attachments) {
      try {
        if (!att.file_path) continue;

        // 读取附件文件
        const fs = await import("fs");
        if (!fs.existsSync(att.file_path)) {
          logger.warn?.(`[loong] iMessage attachment not found: ${att.file_path}`);
          continue;
        }

        const buffer = fs.readFileSync(att.file_path);
        const fileName = att.file_name || att.file_path.split("/").pop() || "attachment";
        const mimeType = att.mime_type || inferMimeTypeFromExtension(fileName);

        // 创建文件元数据
        const metadata = createFileMetadata({
          fileName,
          mimeType,
          size: buffer.length,
          source: "imessage",
        });

        // 保存文件
        await fileStorage.saveFile({
          metadata,
          buffer,
        });

        attachments.push({
          fileId: metadata.fileId,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          size: metadata.size,
          url: `${publicBaseUrl}/api/files/${metadata.fileId}`,
        });

        logger.log?.(
          `[loong] Saved iMessage attachment: ${metadata.fileId} (${metadata.fileName})`,
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error?.(`[loong] Failed to process iMessage attachment: ${errorMessage}`);
      }
    }

    return attachments;
  };

  const handleIncoming = async (message: IMessageMessage) => {
    if (!enabled) return;
    if (!message) return;
    if (message.is_from_me) return;

    const text = message.text?.trim() || "";
    const sender = message.sender ?? undefined;

    if (!isAuthorized(sender)) {
      logger.log?.(`[loong] ignoring message from unauthorized sender: ${sender}`);
      return;
    }

    const chatId = message.chat_id ?? undefined;
    const contextKey = resolveContextKey({ sender, chatId });
    const context = contexts.get(contextKey);
    const currentAgentId = context?.agentId || defaultAgentId || "";

    // 处理附件
    const attachments = await processAttachments(message);

    // 如果没有文本和附件，则不处理
    if (!text && attachments.length === 0) return;

    const resolved = resolveAgentFromText?.(text, currentAgentId) ?? {
      agent: null,
      remainder: text,
      switched: false,
    };
    const { agent, remainder, switched } = resolved;
    if (!agent) return;

    if (switched) {
      contexts.set(contextKey, { agentId: agent.id });
    }

    const trimmed = (remainder || "").trim();
    const respond = (replyText: string) => sendText?.({ text: replyText, chatId, sender });

    // 如果只有附件没有文本，或者切换代理后没有文本
    if (!trimmed && attachments.length === 0) {
      await respond(`已切换到 ${agent.name}`);
      return;
    }

    const command = resolveCommand?.(trimmed) || null;
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
              attachments,
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
      attachments,
      onStart: () => sendProcessingNotice(agent, { chatId, sender, text: trimmed }),
    });
  };

  return { handleIncoming };
};
