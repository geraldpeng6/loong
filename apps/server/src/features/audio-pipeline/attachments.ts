import { homedir } from "os";

type ResolveUserPath = (value: unknown, baseDir?: string) => string;

type AttachmentItem = {
  mimeType?: string;
  fileName?: string;
  url?: string;
  path?: string;
  size?: number;
};

type Logger = {
  warn?: (message: string) => void;
};

type AudioMediaItem = {
  path?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  score?: number;
  hash?: string;
  text?: string;
};

type ToolMessage = {
  role?: string;
  toolName?: string;
  details?: Record<string, unknown> | null;
  attachments?: AttachmentItem[];
};

type AgentPayload = {
  type?: string;
  command?: string;
  message?: ToolMessage;
  messages?: ToolMessage[];
  data?: { messages?: ToolMessage[] };
};

export const createAudioPipelineAttachmentTransformer = ({
  toolName = "loong_audio_search",
  resolveUserPath,
  buildFileUrl,
  allowedRoots,
  logger = console,
}: {
  toolName?: string;
  resolveUserPath: ResolveUserPath;
  buildFileUrl: (path: string) => string;
  allowedRoots: string[];
  logger?: Logger;
}) => {
  const normalizedRoots = allowedRoots
    .map((root) => resolveUserPath(root, homedir()))
    .filter(Boolean)
    .map((root) => (root.endsWith("/") ? root : `${root}/`));

  const isAllowedPath = (resolved: string) => {
    const candidate = resolved.endsWith("/") ? resolved : `${resolved}/`;
    return normalizedRoots.some((root) => candidate.startsWith(root) || resolved.startsWith(root));
  };

  const resolveMediaPath = (pathValue?: string) => {
    if (!pathValue) return null;
    const resolved = resolveUserPath(pathValue, homedir());
    if (!resolved || !isAllowedPath(resolved)) {
      logger.warn?.(`[audio-pipeline] blocked media path: ${resolved || pathValue}`);
      return null;
    }
    return resolved;
  };

  const toAttachment = (item: AudioMediaItem): AttachmentItem | null => {
    const resolved = resolveMediaPath(item.path);
    if (!resolved) return null;
    const fileName = item.fileName || resolved.split("/").pop() || "audio";
    const mimeType = item.mimeType || "audio/mpeg";
    const url = buildFileUrl(resolved);
    return {
      mimeType,
      fileName,
      url,
      path: resolved,
      size: item.sizeBytes,
    };
  };

  const decorateMessage = (message?: ToolMessage) => {
    if (!message || message.role !== "toolResult" || message.toolName !== toolName) return;
    const details = message.details || {};
    const media = (details as { media?: AudioMediaItem[] }).media;
    if (!Array.isArray(media) || media.length === 0) return;
    const attachments = media.map(toAttachment).filter(Boolean) as AttachmentItem[];
    if (attachments.length === 0) return;
    message.attachments = attachments;
  };

  return (payload: AgentPayload) => {
    if (!payload || typeof payload !== "object") return payload;
    if (payload.type === "message_end" || payload.type === "message_start") {
      decorateMessage(payload.message);
      return payload;
    }
    if (payload.type === "agent_end" && Array.isArray(payload.messages)) {
      payload.messages.forEach((message) => decorateMessage(message));
      return payload;
    }
    if (payload.type === "response" && payload.command === "get_messages") {
      const messages = payload.data?.messages;
      if (Array.isArray(messages)) {
        messages.forEach((message) => decorateMessage(message));
      }
      return payload;
    }
    return payload;
  };
};
