import type { IncomingMessage } from "http";
import type { RouteHandler } from "../types.js";
import { sendJson } from "../utils.js";
import type { FileStorageService, FileUploadConfig } from "../../files/types.js";
import { createFileMetadata } from "../../files/storage.js";
import { validateFile } from "../../files/validation.js";

export interface CreateUploadRouteOptions {
  /** 文件存储服务 */
  fileStorage: FileStorageService;
  /** 上传配置 */
  config: FileUploadConfig;
  /** 是否仅允许本地请求 */
  localOnly?: boolean;
  /** 是否检查授权 */
  passwordRequired?: boolean;
  /** 授权验证函数 */
  isAuthorizedRequest?: (req: IncomingMessage) => boolean;
}

/**
 * 解析 multipart/form-data 请求
 * 简化版实现，支持单文件上传
 */
const parseMultipartForm = async (
  req: IncomingMessage,
  maxFileSize: number,
): Promise<{
  fields: Record<string, string>;
  files: Array<{ name: string; filename: string; mimeType: string; buffer: Buffer }>;
}> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxFileSize * 2) {
        // 允许一些 overhead
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers["content-type"] || "";

        // 解析 boundary
        const boundaryMatch = contentType.match(/boundary=([^;]+)/);
        if (!boundaryMatch) {
          reject(new Error("Missing boundary in Content-Type"));
          return;
        }

        const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

        const fields: Record<string, string> = {};
        const files: Array<{ name: string; filename: string; mimeType: string; buffer: Buffer }> =
          [];

        // 简单的 multipart 解析
        let start = 0;
        while (start < buffer.length) {
          // 查找下一个 boundary
          const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
          if (boundaryIndex === -1) break;

          // 查找下一个 boundary 或结束 boundary
          const nextBoundaryIndex = buffer.indexOf(
            boundaryBuffer,
            boundaryIndex + boundaryBuffer.length,
          );
          const endBoundaryIndex = buffer.indexOf(
            endBoundaryBuffer,
            boundaryIndex + boundaryBuffer.length,
          );

          let partEnd: number;
          if (
            nextBoundaryIndex !== -1 &&
            (endBoundaryIndex === -1 || nextBoundaryIndex < endBoundaryIndex)
          ) {
            partEnd = nextBoundaryIndex;
          } else if (endBoundaryIndex !== -1) {
            partEnd = endBoundaryIndex;
          } else {
            break;
          }

          // 提取 part 内容（跳过 boundary 和 \r\n）
          const partStart = boundaryIndex + boundaryBuffer.length + 2; // +2 for \r\n
          const partBuffer = buffer.slice(partStart, partEnd - 2); // -2 for \r\n before next boundary

          // 解析 part header
          const headerEndIndex = partBuffer.indexOf("\r\n\r\n");
          if (headerEndIndex === -1) {
            start = boundaryIndex + boundaryBuffer.length;
            continue;
          }

          const headerBuffer = partBuffer.slice(0, headerEndIndex);
          const bodyBuffer = partBuffer.slice(headerEndIndex + 4); // +4 for \r\n\r\n

          const header = headerBuffer.toString("utf-8");

          // 检查是否为文件
          const filenameMatch = header.match(/filename="([^"]*)"/);
          if (filenameMatch) {
            const nameMatch = header.match(/name="([^"]*)"/);
            const mimeTypeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);

            files.push({
              name: nameMatch?.[1] || "file",
              filename: filenameMatch[1],
              mimeType: mimeTypeMatch?.[1]?.trim() || "application/octet-stream",
              buffer: bodyBuffer,
            });
          } else {
            // 普通字段
            const nameMatch = header.match(/name="([^"]*)"/);
            if (nameMatch) {
              fields[nameMatch[1]] = bodyBuffer.toString("utf-8");
            }
          }

          start = boundaryIndex + boundaryBuffer.length;
        }

        resolve({ fields, files });
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
};

/**
 * 创建文件上传路由
 *
 * POST /api/upload - 上传文件
 * GET /api/files/:fileId - 获取/下载文件
 * DELETE /api/files/:fileId - 删除文件
 */
export const createUploadRoute = ({
  fileStorage,
  config,
  localOnly = false,
  passwordRequired = false,
  isAuthorizedRequest,
}: CreateUploadRouteOptions): RouteHandler => {
  return async (req, res, url) => {
    const pathname = url.pathname;
    const method = req.method || "GET";

    // 检查本地请求限制
    if (localOnly) {
      const remoteAddress = req.socket.remoteAddress || "";
      const isLocal =
        remoteAddress === "127.0.0.1" ||
        remoteAddress === "::1" ||
        remoteAddress === "::ffff:127.0.0.1";
      if (!isLocal) {
        sendJson(res, 403, { error: "Forbidden: local only" });
        return true;
      }
    }

    // 检查授权
    if (passwordRequired && isAuthorizedRequest && !isAuthorizedRequest(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }

    // POST /api/upload - 上传文件
    if (pathname === "/api/upload" && method === "POST") {
      try {
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          sendJson(res, 400, { error: "Content-Type must be multipart/form-data" });
          return true;
        }

        const { fields, files } = await parseMultipartForm(req, config.maxFileSize);

        if (files.length === 0) {
          sendJson(res, 400, { error: "No file uploaded" });
          return true;
        }

        const uploadedFile = files[0];
        const source = (fields.source as "web" | "imessage" | "api") || "web";
        const sessionId = fields.sessionId;
        const userId = fields.userId;

        // 验证文件
        const validation = validateFile({
          fileName: uploadedFile.filename,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.buffer.length,
          config,
        });

        if (!validation.valid) {
          sendJson(res, 400, { error: validation.error });
          return true;
        }

        // 创建元数据
        const metadata = createFileMetadata({
          fileName: uploadedFile.filename,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.buffer.length,
          source,
          sessionId,
          userId,
        });

        // 保存文件
        await fileStorage.saveFile({
          metadata,
          buffer: uploadedFile.buffer,
        });

        // 构建响应
        const response = {
          success: true,
          file: {
            fileId: metadata.fileId,
            fileName: metadata.fileName,
            mimeType: metadata.mimeType,
            size: metadata.size,
            url: `${config.publicBaseUrl}/api/files/${metadata.fileId}`,
            uploadedAt: metadata.uploadedAt,
          },
        };

        sendJson(res, 200, response);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[upload] Upload failed:`, message);
        sendJson(res, 500, { error: "Upload failed", details: message });
        return true;
      }
    }

    // GET /api/files/:fileId - 获取/下载文件
    if (pathname.startsWith("/api/files/") && method === "GET") {
      const fileId = pathname.slice("/api/files/".length).split("/")[0];
      if (!fileId) {
        sendJson(res, 400, { error: "Missing fileId" });
        return true;
      }

      try {
        const metadata = await fileStorage.getMetadata(fileId);
        if (!metadata) {
          sendJson(res, 404, { error: "File not found" });
          return true;
        }

        const fileBuffer = await fileStorage.readFile(fileId);
        if (!fileBuffer) {
          sendJson(res, 404, { error: "File not found" });
          return true;
        }

        // 检查是否下载
        const download = url.searchParams.get("download") === "true";

        const headers: Record<string, string> = {
          "content-type": metadata.mimeType,
          "content-length": String(fileBuffer.length),
          "cache-control": "public, max-age=86400",
        };

        if (download) {
          headers["content-disposition"] =
            `attachment; filename="${encodeURIComponent(metadata.fileName)}"`;
        }

        res.writeHead(200, headers);
        res.end(fileBuffer);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[upload] File retrieval failed:`, message);
        sendJson(res, 500, { error: "Failed to retrieve file" });
        return true;
      }
    }

    // DELETE /api/files/:fileId - 删除文件
    if (pathname.startsWith("/api/files/") && method === "DELETE") {
      const fileId = pathname.slice("/api/files/".length).split("/")[0];
      if (!fileId) {
        sendJson(res, 400, { error: "Missing fileId" });
        return true;
      }

      try {
        const deleted = await fileStorage.deleteFile(fileId);
        if (!deleted) {
          sendJson(res, 404, { error: "File not found" });
          return true;
        }

        sendJson(res, 200, { success: true, message: "File deleted" });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[upload] File deletion failed:`, message);
        sendJson(res, 500, { error: "Failed to delete file" });
        return true;
      }
    }

    return false;
  };
};
