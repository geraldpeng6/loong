import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  readdirSync,
  rmdirSync,
} from "fs";
import { dirname, join } from "path";
import type { FileMetadata, FileStorageService, FileUploadConfig } from "./types.js";
import type { UploadedFile } from "./types.js";
import { generateFileId, generateStoragePath } from "./types.js";

export interface CreateFileStorageOptions {
  config: FileUploadConfig;
  logger?: Console;
}

/**
 * 创建文件存储服务
 * 管理文件的保存、读取、删除和清理
 */
export const createFileStorage = ({
  config,
  logger = console,
}: CreateFileStorageOptions): FileStorageService => {
  const { uploadDir } = config;

  // 内存中的元数据缓存（简单实现，可考虑使用 LRU 或持久化存储）
  const metadataCache = new Map<string, FileMetadata>();

  /** 确保目录存在 */
  const ensureDir = (dir: string) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  };

  /** 获取元数据文件路径 */
  const getMetadataPath = (fileId: string): string => {
    return join(uploadDir, "metadata", `${fileId}.json`);
  };

  /** 获取完整存储路径 */
  const getFullStoragePath = (storagePath: string): string => {
    return join(uploadDir, "files", storagePath);
  };

  /** 保存元数据 */
  const saveMetadata = (metadata: FileMetadata): void => {
    const metaPath = getMetadataPath(metadata.fileId);
    ensureDir(dirname(metaPath));
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
    metadataCache.set(metadata.fileId, metadata);
  };

  /** 加载元数据 */
  const loadMetadata = (fileId: string): FileMetadata | null => {
    // 先查缓存
    const cached = metadataCache.get(fileId);
    if (cached) return cached;

    const metaPath = getMetadataPath(fileId);
    if (!existsSync(metaPath)) return null;

    try {
      const data = readFileSync(metaPath, "utf-8");
      const metadata = JSON.parse(data) as FileMetadata;
      metadataCache.set(fileId, metadata);
      return metadata;
    } catch (err) {
      logger.error(`[fileStorage] Failed to load metadata for ${fileId}:`, err);
      return null;
    }
  };

  /** 保存文件 */
  const saveFile = async (file: UploadedFile): Promise<FileMetadata> => {
    const { metadata, buffer } = file;
    const fullPath = getFullStoragePath(metadata.storagePath);

    // 确保目录存在
    ensureDir(dirname(fullPath));

    // 写入文件
    writeFileSync(fullPath, buffer);

    // 保存元数据
    saveMetadata(metadata);

    logger.log(
      `[fileStorage] Saved file ${metadata.fileId}: ${metadata.fileName} (${metadata.size} bytes)`,
    );

    return metadata;
  };

  /** 读取文件 */
  const readFile = async (fileId: string): Promise<Buffer | null> => {
    const metadata = loadMetadata(fileId);
    if (!metadata) return null;

    const fullPath = getFullStoragePath(metadata.storagePath);
    if (!existsSync(fullPath)) return null;

    try {
      return readFileSync(fullPath);
    } catch (err) {
      logger.error(`[fileStorage] Failed to read file ${fileId}:`, err);
      return null;
    }
  };

  /** 获取文件元数据 */
  const getMetadata = async (fileId: string): Promise<FileMetadata | null> => {
    return loadMetadata(fileId);
  };

  /** 删除文件 */
  const deleteFile = async (fileId: string): Promise<boolean> => {
    const metadata = loadMetadata(fileId);
    if (!metadata) return false;

    try {
      // 删除实际文件
      const fullPath = getFullStoragePath(metadata.storagePath);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }

      // 删除元数据
      const metaPath = getMetadataPath(fileId);
      if (existsSync(metaPath)) {
        unlinkSync(metaPath);
      }

      // 从缓存移除
      metadataCache.delete(fileId);

      logger.log(`[fileStorage] Deleted file ${fileId}`);
      return true;
    } catch (err) {
      logger.error(`[fileStorage] Failed to delete file ${fileId}:`, err);
      return false;
    }
  };

  /** 获取文件路径 */
  const getFilePath = (fileId: string): string | null => {
    const metadata = loadMetadata(fileId);
    if (!metadata) return null;
    return getFullStoragePath(metadata.storagePath);
  };

  /** 递归删除空目录 */
  const removeEmptyDirs = (dir: string): void => {
    try {
      const files = readdirSync(dir);
      if (files.length === 0) {
        rmdirSync(dir);
        const parent = dirname(dir);
        if (parent !== dir && parent !== uploadDir) {
          removeEmptyDirs(parent);
        }
      }
    } catch {
      // 忽略错误
    }
  };

  /** 清理过期文件 */
  const cleanupExpiredFiles = async (maxAgeMs: number): Promise<number> => {
    const now = Date.now();
    let deletedCount = 0;

    try {
      const metadataDir = join(uploadDir, "metadata");
      if (!existsSync(metadataDir)) return 0;

      const files = readdirSync(metadataDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const fileId = file.slice(0, -5); // 移除 .json
        const metadata = loadMetadata(fileId);
        if (!metadata) continue;

        const uploadedAt = new Date(metadata.uploadedAt).getTime();
        if (now - uploadedAt > maxAgeMs) {
          const deleted = await deleteFile(fileId);
          if (deleted) {
            deletedCount++;
            // 尝试清理空目录
            const filePath = getFullStoragePath(metadata.storagePath);
            removeEmptyDirs(dirname(filePath));
          }
        }
      }

      logger.log(`[fileStorage] Cleaned up ${deletedCount} expired files`);
      return deletedCount;
    } catch (err) {
      logger.error(`[fileStorage] Cleanup failed:`, err);
      return deletedCount;
    }
  };

  // 初始化目录
  ensureDir(uploadDir);
  ensureDir(join(uploadDir, "files"));
  ensureDir(join(uploadDir, "metadata"));

  return {
    saveFile,
    readFile,
    getMetadata,
    deleteFile,
    getFilePath,
    cleanupExpiredFiles,
  };
};

/**
 * 创建文件元数据（工厂函数）
 */
export const createFileMetadata = ({
  fileName,
  mimeType,
  size,
  source = "unknown",
  sessionId,
  userId,
}: {
  fileName: string;
  mimeType: string;
  size: number;
  source?: "web" | "imessage" | "api" | "unknown";
  sessionId?: string;
  userId?: string;
}): FileMetadata => {
  const fileId = generateFileId();
  const storagePath = generateStoragePath(fileId, fileName);

  return {
    fileId,
    fileName,
    mimeType,
    size,
    storagePath,
    uploadedAt: new Date().toISOString(),
    source,
    sessionId,
    userId,
  };
};
