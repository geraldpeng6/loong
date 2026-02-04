import { existsSync, readFileSync, writeFileSync } from "fs";
import { extname, join } from "path";

const MEDIA_EXTENSION_MAP = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

const resolveMediaExtension = (mimeType, fileName) => {
  if (fileName) {
    const ext = extname(fileName).replace(".", "");
    if (ext) return ext;
  }
  if (mimeType && MEDIA_EXTENSION_MAP[mimeType]) {
    return MEDIA_EXTENSION_MAP[mimeType];
  }
  if (mimeType && mimeType.includes("/")) {
    return mimeType.split("/")[1];
  }
  return "bin";
};

const sanitizeFileName = (name) => {
  if (!name) return "attachment";
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "attachment";
};

export const resolveMediaPlaceholder = (mimeType) => {
  if (!mimeType) return "<media:attachment>";
  if (mimeType.startsWith("image/")) return "<media:image>";
  if (mimeType.startsWith("audio/")) return "<media:audio>";
  if (mimeType.startsWith("video/")) return "<media:video>";
  return "<media:attachment>";
};

export const collectOutboundMedia = (messages = []) => {
  const items = [];
  for (const message of messages) {
    if (!message) continue;
    if (message.role !== "assistant" && message.role !== "toolResult") continue;
    if (Array.isArray(message.attachments)) {
      for (const attachment of message.attachments) {
        let data = attachment?.content;
        if (!data && attachment?.path && existsSync(attachment.path)) {
          try {
            data = readFileSync(attachment.path).toString("base64");
          } catch {
            data = null;
          }
        }
        if (!data) continue;
        items.push({
          data,
          mimeType: attachment.mimeType || "application/octet-stream",
          fileName: attachment.fileName || "attachment",
        });
      }
    }
    if (Array.isArray(message.content)) {
      let imageIndex = 1;
      for (const block of message.content) {
        if (block?.type !== "image" || !block.data) continue;
        items.push({
          data: block.data,
          mimeType: block.mimeType || "image/png",
          fileName: `image-${imageIndex++}`,
        });
      }
    }
  }
  return items;
};

export const createMediaHelpers = ({ outboundDir, ensureOutboundDir } = {}) => {
  const writeOutboundMediaFile = ({ data, mimeType, fileName }) => {
    if (!data || !outboundDir) return null;
    ensureOutboundDir?.();
    const extension = resolveMediaExtension(mimeType, fileName);
    const baseName = sanitizeFileName(fileName ? fileName.replace(/\.[^.]+$/, "") : "attachment");
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const resolvedName = `${baseName}-${suffix}.${extension}`;
    const filePath = join(outboundDir, resolvedName);
    writeFileSync(filePath, Buffer.from(data, "base64"));
    return filePath;
  };

  return { writeOutboundMediaFile, resolveMediaPlaceholder, collectOutboundMedia };
};
