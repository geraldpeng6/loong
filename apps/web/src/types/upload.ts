/**
 * 文件上传相关类型定义
 */

export interface UploadedFileInfo {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AttachmentReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface PendingAttachment extends AttachmentReference {
  /** 本地预览 URL */
  previewUrl?: string;
  /** 上传状态 */
  status: "pending" | "uploading" | "done" | "error";
  /** 上传进度 */
  progress?: UploadProgress;
  /** 错误信息 */
  error?: string;
  /** 原始文件对象 */
  file?: File;
}

export type FileKind = "image" | "audio" | "video" | "document" | "unknown";

/**
 * 获取文件类型分类
 */
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

/**
 * 格式化文件大小
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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
 * 获取文件图标类型
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
