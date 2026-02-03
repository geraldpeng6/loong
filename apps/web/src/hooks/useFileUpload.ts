import { useCallback, useState } from "react";
import type { PendingAttachment, UploadedFileInfo } from "@/types/upload";

export interface UseFileUploadOptions {
  /** 最大文件大小（字节），默认 10MB */
  maxFileSize?: number;
  /** 允许的文件类型 */
  allowedTypes?: string[];
  /** 上传 API 端点 */
  uploadUrl?: string;
}

export interface UseFileUploadReturn {
  /** 待上传的附件列表 */
  pendingAttachments: PendingAttachment[];
  /** 是否正在上传 */
  isUploading: boolean;
  /** 添加文件 */
  addFiles: (files: FileList | null) => void;
  /** 移除附件 */
  removeAttachment: (fileId: string) => void;
  /** 清空所有附件 */
  clearAttachments: () => void;
  /** 上传所有待上传文件 */
  uploadAll: () => Promise<PendingAttachment[]>;
  /** 上传单个文件 */
  uploadFile: (file: File) => Promise<PendingAttachment | null>;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const generateTempId = (): string => {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const createPreviewUrl = (file: File): string | undefined => {
  if (file.type.startsWith("image/")) {
    return URL.createObjectURL(file);
  }
  return undefined;
};

/**
 * 文件上传 Hook
 */
export const useFileUpload = ({
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  allowedTypes,
  uploadUrl = "/api/upload",
}: UseFileUploadOptions = {}): UseFileUploadReturn => {
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  /**
   * 验证文件
   */
  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxFileSize) {
        const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(2);
        return `File size exceeds ${maxSizeMB}MB limit`;
      }

      if (allowedTypes && allowedTypes.length > 0) {
        const isAllowed = allowedTypes.some((type) => {
          if (type.endsWith("/")) {
            return file.type.startsWith(type);
          }
          return file.type === type;
        });
        if (!isAllowed) {
          return `File type "${file.type}" is not allowed`;
        }
      }

      return null;
    },
    [maxFileSize, allowedTypes],
  );

  /**
   * 添加文件
   */
  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const newAttachments: PendingAttachment[] = [];

      Array.from(files).forEach((file) => {
        const error = validateFile(file);
        const tempId = generateTempId();

        newAttachments.push({
          fileId: tempId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          url: "",
          previewUrl: createPreviewUrl(file),
          status: error ? "error" : "pending",
          error: error || undefined,
          file,
        });
      });

      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    },
    [validateFile],
  );

  /**
   * 移除附件
   */
  const removeAttachment = useCallback((fileId: string) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((a) => a.fileId === fileId);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((a) => a.fileId !== fileId);
    });
  }, []);

  /**
   * 清空所有附件
   */
  const clearAttachments = useCallback(() => {
    setPendingAttachments((prev) => {
      prev.forEach((a) => {
        if (a.previewUrl) {
          URL.revokeObjectURL(a.previewUrl);
        }
      });
      return [];
    });
  }, []);

  /**
   * 上传单个文件
   */
  const uploadFile = useCallback(
    async (file: File): Promise<PendingAttachment | null> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", "web");

      try {
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || `Upload failed: ${response.status}`);
        }

        const result: { success: boolean; file: UploadedFileInfo } = await response.json();

        if (!result.success || !result.file) {
          throw new Error("Invalid upload response");
        }

        return {
          fileId: result.file.fileId,
          fileName: result.file.fileName,
          mimeType: result.file.mimeType,
          size: result.file.size,
          url: result.file.url,
          status: "done",
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return {
          fileId: generateTempId(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          url: "",
          status: "error",
          error: message,
          file,
        };
      }
    },
    [uploadUrl],
  );

  /**
   * 上传所有待上传文件
   */
  const uploadAll = useCallback(async (): Promise<PendingAttachment[]> => {
    const pendingFiles = pendingAttachments.filter((a) => a.status === "pending" && a.file);
    if (pendingFiles.length === 0) {
      return pendingAttachments.filter((a) => a.status === "done");
    }

    setIsUploading(true);

    const results: PendingAttachment[] = [];

    for (const attachment of pendingFiles) {
      if (!attachment.file) continue;

      // 更新状态为上传中
      setPendingAttachments((prev) =>
        prev.map((a) => (a.fileId === attachment.fileId ? { ...a, status: "uploading" } : a)),
      );

      const result = await uploadFile(attachment.file);

      if (result) {
        results.push(result);
        // 更新状态
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.fileId === attachment.fileId ? { ...result, previewUrl: a.previewUrl } : a,
          ),
        );
      }
    }

    setIsUploading(false);

    return [...pendingAttachments.filter((a) => a.status === "done"), ...results];
  }, [pendingAttachments, uploadFile]);

  return {
    pendingAttachments,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    uploadAll,
    uploadFile,
  };
};
