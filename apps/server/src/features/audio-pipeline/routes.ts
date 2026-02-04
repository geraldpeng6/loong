import { createReadStream, existsSync, readFileSync, statSync } from "fs";
import { basename, extname, join } from "path";
import { homedir } from "os";
import type { RouteHandler } from "../../core/http/types.js";
import { isLocalRequest, sendJson, readBody } from "../../core/http/utils.js";
import type { AudioPipelineConfigUpdate, AudioPipelineManager } from "./manager.js";

// MIME type mapping for audio files
const EXTENSION_MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
  ".txt": "text/plain",
  ".json": "application/json",
};

const guessMimeType = (fileName: string): string => {
  if (!fileName) return "application/octet-stream";
  const ext = extname(fileName).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || "application/octet-stream";
};

export const createAudioPipelineRoutes = ({
  notifyLocalOnly,
  runAudioPipelineQuery,
  resolveUserPath,
  audioPipelineMaxTop,
  audioPipelineMaxBytes,
  audioPipelineMaxTotalBytes,
  audioPipelineManager,
  pipelineAllowRoots = [],
  getPipelineAllowRoots,
  updatePipelineConfig,
  maxBodyBytes = 0,
}: {
  notifyLocalOnly: boolean;
  runAudioPipelineQuery: (payload: Record<string, unknown>) => Promise<unknown>;
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  audioPipelineMaxTop: number;
  audioPipelineMaxBytes: number;
  audioPipelineMaxTotalBytes: number;
  audioPipelineManager?: AudioPipelineManager | null;
  pipelineAllowRoots?: string[];
  getPipelineAllowRoots?: () => string[];
  updatePipelineConfig?: (
    update: AudioPipelineConfigUpdate,
  ) => { ok: true; status: unknown } | { ok: false; error: string };
  maxBodyBytes?: number;
}): RouteHandler[] => {
  const resolveAllowedRoots = () =>
    (typeof getPipelineAllowRoots === "function" ? getPipelineAllowRoots() : pipelineAllowRoots) ||
    [];

  const normalizeRoots = () =>
    resolveAllowedRoots()
      .map((entry) => resolveUserPath(entry, homedir()))
      .filter(Boolean)
      .map((entry) => (entry.endsWith("/") ? entry : `${entry}/`));

  const isAllowedPath = (resolved: string) => {
    const normalizedRoots = normalizeRoots();
    if (normalizedRoots.length === 0) return true;
    const candidate = resolved.endsWith("/") ? resolved : `${resolved}/`;
    return normalizedRoots.some((root) => candidate.startsWith(root) || resolved.startsWith(root));
  };

  const resolvePipelinePath = (rawPath: string | null) => {
    if (!rawPath) return null;
    const decoded = decodeURIComponent(rawPath);
    const resolved = resolveUserPath(decoded, homedir());
    if (!resolved || !isAllowedPath(resolved)) return null;
    return resolved;
  };

  const readRequestBody = (req: Parameters<RouteHandler>[0]) =>
    readBody(req, { maxBytes: maxBodyBytes });

  const statusRoute: RouteHandler = async (req, res, url) => {
    if (url.pathname !== "/api/audio-pipeline/status") return false;
    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    if (!audioPipelineManager) {
      sendJson(res, 200, { success: false, error: "audio-pipeline manager not configured" });
      return true;
    }

    if (req.method === "GET") {
      sendJson(res, 200, { success: true, ...audioPipelineManager.getStatus() });
      return true;
    }

    if (req.method === "POST") {
      try {
        const body = await readRequestBody(req);
        const enabled = body?.enabled;

        const updates: AudioPipelineConfigUpdate = {};
        if (Array.isArray(body?.inputDirs)) {
          updates.inputDirs = body.inputDirs
            .map((entry: unknown) => String(entry || "").trim())
            .filter(Boolean);
        }
        if (typeof body?.outputDir === "string") {
          updates.outputDir = body.outputDir.trim();
        }
        if (typeof body?.pipelineDir === "string") {
          updates.pipelineDir = body.pipelineDir.trim();
        }

        let status: unknown | null = null;

        if (Object.keys(updates).length > 0) {
          if (!updatePipelineConfig) {
            sendJson(res, 400, { error: "Pipeline config updates not supported" });
            return true;
          }
          const updateResult = updatePipelineConfig(updates);
          if (!updateResult.ok) {
            sendJson(res, 500, { error: updateResult.error });
            return true;
          }
          status = updateResult.status;
        }

        if (typeof enabled === "boolean") {
          const result = audioPipelineManager.setEnabled(enabled);
          if (!result.ok) {
            sendJson(res, 500, { error: result.error });
            return true;
          }
          status = result.status;
        }

        if (!status) {
          sendJson(res, 400, { error: "Missing or invalid fields" });
          return true;
        }

        sendJson(res, 200, { success: true, ...(status as Record<string, unknown>) });
      } catch (err) {
        const status = err instanceof Error && err.message === "Request body too large" ? 413 : 400;
        sendJson(res, status, {
          error: status === 413 ? "Request body too large" : "Invalid JSON body",
        });
      }
      return true;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  };

  const fileRoute: RouteHandler = async (req, res, url) => {
    if (url.pathname !== "/api/audio-pipeline/file") return false;
    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }
    const rawPath = url.searchParams.get("path");
    const resolvedPath = resolvePipelinePath(rawPath);
    if (!resolvedPath) {
      sendJson(res, 400, { error: "Invalid path" });
      return true;
    }
    if (!existsSync(resolvedPath)) {
      sendJson(res, 404, { error: "File not found" });
      return true;
    }

    const stat = statSync(resolvedPath);
    if (stat.size > audioPipelineMaxBytes) {
      sendJson(res, 413, { error: "File too large" });
      return true;
    }

    const fileName = basename(resolvedPath);
    const mimeType = guessMimeType(fileName);
    res.writeHead(200, {
      "content-type": mimeType,
      "content-length": String(stat.size),
    });
    createReadStream(resolvedPath).pipe(res);
    return true;
  };

  const queryRoute: RouteHandler = async (req, res, url) => {
    if (url.pathname !== "/api/audio-pipeline/query" || req.method !== "POST") return false;

    if (notifyLocalOnly && !isLocalRequest(req)) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    try {
      const body = await readRequestBody(req);
      const {
        query,
        outputDir,
        top = 5,
        minScore,
        includeTranscription = true,
        maxTotalBytes,
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

      const safeTop = Math.min(topNumber, audioPipelineMaxTop || topNumber);
      const parsedMinScore = minScore == null ? null : Number(minScore);
      if (
        parsedMinScore != null &&
        (!Number.isFinite(parsedMinScore) || parsedMinScore < -1 || parsedMinScore > 1)
      ) {
        sendJson(res, 400, { error: "Invalid 'minScore' field" });
        return true;
      }

      const safeMaxTotalBytes = Math.min(
        Number.isFinite(Number(maxTotalBytes)) ? Number(maxTotalBytes) : audioPipelineMaxTotalBytes,
        audioPipelineMaxTotalBytes,
      );

      let queryResult;
      try {
        queryResult = await runAudioPipelineQuery({ query, outputDir, top: safeTop });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: message });
        return true;
      }

      const results = [];
      const skipped = [];
      let totalBytes = 0;

      for (const item of queryResult.results || []) {
        const score = Number(item?.score ?? 0);
        const hash = item?.hash || null;
        if (!hash) continue;
        if (parsedMinScore != null && score < parsedMinScore) {
          skipped.push({ hash, reason: "below_min_score" });
          continue;
        }

        let filePath = item?.filename;
        let text = item?.text || "";

        if (!filePath && queryResult.outputDir) {
          const metaPath = join(queryResult.outputDir, "metadata", `${hash}.json`);
          if (existsSync(metaPath)) {
            try {
              const meta = JSON.parse(readFileSync(metaPath, "utf8"));
              filePath = meta?.filename || null;
              text = meta?.text || "";
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
        if (totalBytes + stat.size > safeMaxTotalBytes) {
          skipped.push({ hash, reason: "total_limit_exceeded" });
          continue;
        }

        const resultItem: Record<string, unknown> = {
          score,
          hash,
          fileName: basename(resolvedPath),
          path: resolvedPath,
          text: includeTranscription ? text : undefined,
        };

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
        maxTotalBytes: safeMaxTotalBytes,
        results,
        skipped,
      });
    } catch (err) {
      const status = err instanceof Error && err.message === "Request body too large" ? 413 : 400;
      sendJson(res, status, {
        error: status === 413 ? "Request body too large" : "Invalid JSON body",
      });
    }

    return true;
  };

  return [statusRoute, fileRoute, queryRoute];
};
