import { readFileSync } from "fs";
import { homedir } from "os";

type ResolveUserPath = (value: unknown, baseDir?: string) => string;

type AttachmentItem = {
  mimeType?: string;
  fileName?: string;
  url?: string;
  content?: string;
  size?: number;
};

type Logger = {
  warn?: (message: string) => void;
};

type PipelineMediaItem = {
  path?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  score?: number;
  hash?: string;
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

export const createPipelineAttachmentTransformer = ({
  toolName = "loong_img_search",
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
      logger.warn?.(`[img-pipeline] blocked media path: ${resolved || pathValue}`);
      return null;
    }
    return resolved;
  };

  const toAttachment = (item: PipelineMediaItem): AttachmentItem | null => {
    const resolved = resolveMediaPath(item.path);
    if (!resolved) return null;
    const fileName = item.fileName || resolved.split("/").pop() || "image";
    const mimeType = item.mimeType || undefined;
    const url = buildFileUrl(resolved);
    let content: string | undefined;

    try {
      content = readFileSync(resolved).toString("base64");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[img-pipeline] failed to read media: ${resolved} (${message})`);
    }

    return {
      mimeType,
      fileName,
      url,
      content,
      size: item.sizeBytes,
    };
  };

  const decorateMessage = (message?: ToolMessage) => {
    if (!message || message.role !== "toolResult" || message.toolName !== toolName) return;
    const details = message.details || {};
    const media = (details as { media?: PipelineMediaItem[] }).media;
    if (!Array.isArray(media) || media.length === 0) return;

    if (!Array.isArray(message.attachments) || message.attachments.length === 0) {
      const attachments = media.map(toAttachment).filter(Boolean) as AttachmentItem[];
      if (attachments.length > 0) {
        message.attachments = attachments;
      }
    }

    message.details = {
      ...details,
      media: media.map((item) => {
        const { path, ...rest } = item;
        void path;
        return rest;
      }),
    };
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
