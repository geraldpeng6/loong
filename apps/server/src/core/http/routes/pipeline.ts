import { existsSync, readFileSync, statSync } from "fs";
import { basename, extname, join } from "path";
import { homedir } from "os";
import type { RouteHandler } from "../types.js";
import { isLocalRequest, sendJson } from "../utils.js";

export const createPipelineRoute = ({
  notifyLocalOnly,
  readBody,
  runImgPipelineQuery,
  normalizeStringList,
  resolveUserPath,
  guessMimeType,
  imgPipelineMaxTop,
  imgPipelineMaxBytes,
  imgPipelineMaxTotalBytes,
}): RouteHandler => {
  return async (req, res, url) => {
    if (url.pathname !== "/api/pipeline/query-media" || req.method !== "POST") return false;

    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    try {
      const body = await readBody(req);
      const {
        query,
        outputDir,
        top = 5,
        minScore,
        includeContent = true,
        includePaths = true,
        maxBytes,
        maxTotalBytes,
        allowedMimeTypes,
        allowedExtensions,
      } = body || {};

      if (!query || typeof query !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'query' field" });
        return true;
      }

      const topNumber = Number(top);
      if (!Number.isFinite(topNumber) || topNumber <= 0) {
        sendJson(res, 400, { error: "Invalid 'top' field" });
        return true;
      }

      const safeTop = Math.min(topNumber, imgPipelineMaxTop || topNumber);
      const parsedMinScore = minScore == null ? null : Number(minScore);
      if (
        parsedMinScore != null &&
        (!Number.isFinite(parsedMinScore) || parsedMinScore < -1 || parsedMinScore > 1)
      ) {
        sendJson(res, 400, { error: "Invalid 'minScore' field" });
        return true;
      }

      const safeMaxBytes = Math.min(
        Number.isFinite(Number(maxBytes)) ? Number(maxBytes) : imgPipelineMaxBytes,
        imgPipelineMaxBytes,
      );
      const safeMaxTotalBytes = Math.min(
        Number.isFinite(Number(maxTotalBytes)) ? Number(maxTotalBytes) : imgPipelineMaxTotalBytes,
        imgPipelineMaxTotalBytes,
      );

      const allowedMimes = normalizeStringList(allowedMimeTypes);
      const allowedExts = normalizeStringList(allowedExtensions);

      let queryResult;
      try {
        queryResult = await runImgPipelineQuery({ query, outputDir, top: safeTop });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: message });
        return true;
      }

      const results = [];
      const skipped = [];
      let totalBytes = 0;

      for (const item of queryResult.results || []) {
        const score = Number(item?.score ?? item?.sim ?? 0);
        const hash = item?.hash || null;
        if (!hash) continue;
        if (parsedMinScore != null && score < parsedMinScore) {
          skipped.push({ hash, reason: "below_min_score" });
          continue;
        }

        let filePath = item?.path;
        if (!filePath && queryResult.outputDir) {
          const metaPath = join(queryResult.outputDir, "metadata", `${hash}.json`);
          if (existsSync(metaPath)) {
            try {
              const meta = JSON.parse(readFileSync(metaPath, "utf8"));
              filePath = meta?.filename || null;
            } catch {
              filePath = null;
            }
          }
        }

        if (!filePath) {
          skipped.push({ hash, reason: "missing_path" });
          continue;
        }

        const resolvedPath = resolveUserPath(filePath, homedir());
        if (!existsSync(resolvedPath)) {
          skipped.push({ hash, reason: "file_not_found" });
          continue;
        }

        const stat = statSync(resolvedPath);
        if (stat.size > safeMaxBytes) {
          skipped.push({ hash, reason: "file_too_large", size: stat.size });
          continue;
        }
        if (totalBytes + stat.size > safeMaxTotalBytes) {
          skipped.push({ hash, reason: "total_limit_exceeded" });
          continue;
        }

        const fileName = basename(resolvedPath);
        const mimeType = guessMimeType(fileName);
        if (allowedMimes) {
          const ok = allowedMimes.some((entry) => mimeType === entry || mimeType.startsWith(entry));
          if (!ok) {
            skipped.push({ hash, reason: "mime_not_allowed", mimeType });
            continue;
          }
        }
        if (allowedExts) {
          const ext = extname(fileName).toLowerCase().replace(".", "");
          if (!allowedExts.includes(ext)) {
            skipped.push({ hash, reason: "ext_not_allowed", ext });
            continue;
          }
        }

        const resultItem: Record<string, unknown> = {
          score,
          hash,
          mimeType,
          fileName,
          sizeBytes: stat.size,
        };
        if (includePaths) {
          resultItem.path = resolvedPath;
        }
        if (includeContent) {
          resultItem.content = readFileSync(resolvedPath).toString("base64");
        }

        results.push(resultItem);
        totalBytes += stat.size;
        if (results.length >= safeTop) break;
      }

      sendJson(res, 200, {
        success: true,
        query,
        outputDir: queryResult.outputDir,
        top: safeTop,
        minScore: parsedMinScore,
        maxBytes: safeMaxBytes,
        maxTotalBytes: safeMaxTotalBytes,
        results,
        skipped,
      });
    } catch (err) {
      const status = err?.message === "Request body too large" ? 413 : 400;
      sendJson(res, status, {
        error: status === 413 ? "Request body too large" : "Invalid JSON body",
      });
    }

    return true;
  };
};
