import type { GatewayMessage, ToolCallBlock } from "@/types/gateway";

export type AttachmentItem = {
  kind: "image" | "audio" | "video" | "file";
  mimeType: string;
  data: string | null;
  fileName: string;
  preview?: string | null;
  url?: string | null;
};

export type ToolCallItem = {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown> | string;
  partialJson?: string;
};

export const extractText = (content: GatewayMessage["content"]) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block) return "";
        if (block.type === "text" || block.type === "input_text") return block.text || "";
        return "";
      })
      .join("");
  }
  return "";
};

export const extractToolCalls = (content: GatewayMessage["content"]) => {
  if (!Array.isArray(content)) return [] as ToolCallItem[];
  return content
    .filter((block): block is ToolCallBlock => {
      if (!block || typeof block !== "object") return false;
      return block.type === "toolCall" || block.type === "tool_call";
    })
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.arguments,
      partialJson: block.partialJson,
    }));
};

export const extractAttachments = (message: GatewayMessage): AttachmentItem[] => {
  const items: AttachmentItem[] = [];
  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (!attachment?.content && !attachment?.url) continue;
      const mimeType = attachment.mimeType || "application/octet-stream";
      const kind = mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("audio/")
          ? "audio"
          : mimeType.startsWith("video/")
            ? "video"
            : "file";
      items.push({
        kind,
        mimeType,
        data: attachment.content || null,
        fileName: attachment.fileName || "attachment",
        preview: attachment.preview || null,
        url: attachment.url || null,
      });
    }
  }

  if (Array.isArray(message.content)) {
    message.content.forEach((block, index) => {
      if (block?.type === "image" && block.data) {
        items.push({
          kind: "image",
          mimeType: block.mimeType || "image/png",
          data: block.data,
          fileName: `image-${index + 1}`,
          preview: null,
        });
      }
    });
  }

  return items;
};
