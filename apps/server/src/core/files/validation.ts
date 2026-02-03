import type { FileUploadConfig } from "./types.js";
import { getFileKind } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 验证 MIME 类型
 */
export const validateMimeType = (
  mimeType: string,
  allowedTypes: string[],
  allowUnknown: boolean,
): ValidationResult => {
  if (!mimeType || mimeType === "application/octet-stream") {
    if (allowUnknown) {
      return { valid: true };
    }
    return { valid: false, error: "Unknown file type not allowed" };
  }

  const isAllowed = allowedTypes.some((allowed) => {
    // 支持前缀匹配，如 "image/" 匹配所有图片
    if (allowed.endsWith("/")) {
      return mimeType.startsWith(allowed);
    }
    return mimeType === allowed;
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
};

/**
 * 验证文件大小
 */
export const validateFileSize = (size: number, maxSize: number): ValidationResult => {
  if (size <= 0) {
    return { valid: false, error: "Invalid file size" };
  }

  if (size > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB)`,
    };
  }

  return { valid: true };
};

/**
 * 验证文件名
 */
export const validateFileName = (fileName: string): ValidationResult => {
  if (!fileName || typeof fileName !== "string") {
    return { valid: false, error: "Missing or invalid filename" };
  }

  // 检查危险字符
  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(fileName)) {
    return { valid: false, error: "Filename contains invalid characters" };
  }

  // 检查路径遍历
  if (fileName.includes("..") || fileName.includes("//")) {
    return { valid: false, error: "Invalid filename" };
  }

  // 检查长度
  if (fileName.length > 255) {
    return { valid: false, error: "Filename too long (max 255 characters)" };
  }

  return { valid: true };
};

/**
 * 完整验证文件
 */
export interface FileValidationOptions {
  fileName: string;
  mimeType: string;
  size: number;
  config: FileUploadConfig;
}

export const validateFile = ({
  fileName,
  mimeType,
  size,
  config,
}: FileValidationOptions): ValidationResult => {
  // 验证文件名
  const nameResult = validateFileName(fileName);
  if (!nameResult.valid) return nameResult;

  // 验证文件大小
  const sizeResult = validateFileSize(size, config.maxFileSize);
  if (!sizeResult.valid) return sizeResult;

  // 验证 MIME 类型
  const mimeResult = validateMimeType(mimeType, config.allowedMimeTypes, config.allowUnknownTypes);
  if (!mimeResult.valid) return mimeResult;

  return { valid: true };
};

/**
 * 从文件扩展名推断 MIME 类型
 */
export const inferMimeTypeFromExtension = (fileName: string): string => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeMap: Record<string, string> = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    // Video
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    webm: "video/webm",
    flv: "video/x-flv",
    wmv: "video/x-ms-wmv",
    // Documents
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    md: "text/markdown",
    rtf: "application/rtf",
    csv: "text/csv",
    // Microsoft Office
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
  };

  return mimeMap[ext || ""] || "application/octet-stream";
};

/**
 * 检查是否为图片
 */
export const isImage = (mimeType: string): boolean => {
  return mimeType.startsWith("image/");
};

/**
 * 检查是否为音频
 */
export const isAudio = (mimeType: string): boolean => {
  return mimeType.startsWith("audio/");
};

/**
 * 检查是否为视频
 */
export const isVideo = (mimeType: string): boolean => {
  return mimeType.startsWith("video/");
};

/**
 * 检查是否为可预览的文本文件
 */
export const isPreviewableText = (mimeType: string, fileName: string): boolean => {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  if (mimeType === "application/javascript") return true;
  if (mimeType === "application/typescript") return true;
  if (mimeType === "application/xml") return true;
  if (fileName.endsWith(".md")) return true;
  if (fileName.endsWith(".csv")) return true;
  return false;
};

/**
 * 获取文件图标类型（用于前端展示）
 */
export const getFileIconType = (mimeType: string): string => {
  const kind = getFileKind(mimeType);
  switch (kind) {
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "document":
      return "document";
    default:
      return "file";
  }
};
