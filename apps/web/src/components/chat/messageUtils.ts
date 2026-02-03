import type { GatewayMessage } from "@/types/gateway";

export type AttachmentItem = {
  kind: "image" | "audio" | "video" | "file";
  mimeType: string;
  data: string | null;
  fileName: string;
  preview?: string | null;
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

export const extractAttachments = (message: GatewayMessage): AttachmentItem[] => {
  const items: AttachmentItem[] = [];
  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (!attachment?.content) continue;
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
        data: attachment.content,
        fileName: attachment.fileName || "attachment",
        preview: attachment.preview || null,
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
