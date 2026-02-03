/**
 * 通用文件上传模块类型定义
 *
 * 设计原则：
 * 1. 文件上传使用独立 HTTP 端点（而非 WebSocket）以避免阻塞和大小限制
 * 2. WebSocket 仅传递文件元数据引用，实际文件内容按需读取
 * 3. 支持多平台（Web/iMessage/QQ/企业微信）统一的文件处理
 */

/** 文件元数据 */
export interface FileMetadata {
  /** 唯一文件 ID (UUID) */
  fileId: string;
  /** 原始文件名 */
  fileName: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  size: number;
  /** 存储路径（相对 uploadDir） */
  storagePath: string;
  /** 上传时间戳 */
  uploadedAt: string;
  /** 上传来源 */
  source: "web" | "imessage" | "api" | "unknown";
  /** 关联的会话 ID（可选） */
  sessionId?: string;
  /** 关联的用户标识（可选） */
  userId?: string;
}

/** 文件上传配置 */
export interface FileUploadConfig {
  /** 上传目录 */
  uploadDir: string;
  /** 最大文件大小（字节） */
  maxFileSize: number;
  /** 允许的文件类型白名单（MIME 类型前缀，如 "image/"） */
  allowedMimeTypes: string[];
  /** 是否允许未知类型 */
  allowUnknownTypes: boolean;
  /** 文件 URL 基础路径 */
  publicBaseUrl: string;
}

/** 上传的文件项 */
export interface UploadedFile {
  /** 文件元数据 */
  metadata: FileMetadata;
  /** 文件内容 Buffer */
  buffer: Buffer;
}

/** 上传的文件项（别名） */
export type { UploadedFile as FileUploadItem };

/** 附件引用（用于 WebSocket 消息） */
export interface AttachmentReference {
  /** 文件 ID */
  fileId: string;
  /** 文件名 */
  fileName: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小 */
  size: number;
  /** 预览/下载 URL */
  url: string;
}

/** 带附件的 Prompt 消息 */
export interface PromptWithAttachments {
  type: "prompt_with_attachments";
  /** 文本消息 */
  message: string;
  /** 附件列表 */
  attachments: AttachmentReference[];
  /** 可选的会话上下文 */
  sessionId?: string;
}

/** 纯文本 Prompt 消息（向后兼容） */
export interface PlainPrompt {
  type: "prompt";
  message: string;
}

/** WebSocket 消息类型 */
export type WebSocketPromptMessage = PlainPrompt | PromptWithAttachments;

/** 文件存储服务接口 */
export interface FileStorageService {
  /** 保存文件 */
  saveFile(file: UploadedFile): Promise<FileMetadata>;
  /** 读取文件 */
  readFile(fileId: string): Promise<Buffer | null>;
  /** 获取文件元数据 */
  getMetadata(fileId: string): Promise<FileMetadata | null>;
  /** 删除文件 */
  deleteFile(fileId: string): Promise<boolean>;
  /** 获取文件路径 */
  getFilePath(fileId: string): string | null;
  /** 清理过期文件 */
  cleanupExpiredFiles(maxAgeMs: number): Promise<number>;
}

/** MIME 类型分类 */
export type FileKind = "image" | "audio" | "video" | "document" | "unknown";

/** 文件类型工具函数 */
export const getFileKind = (mimeType: string): FileKind => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf" ||
    mimeType.includes("document") ||
    mimeType.includes("sheet") ||
    mimeType.includes("presentation")
  ) {
    return "document";
  }
  return "unknown";
};

/** 默认允许的文件类型 */
export const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "text/",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

/** 默认最大文件大小：10MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 生成文件 ID */
export const generateFileId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};

/** 生成存储路径 */
export const generateStoragePath = (fileId: string, fileName: string): string => {
  const date = new Date();
  const dateDir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  return `${dateDir}/${fileId}${ext}`;
};
