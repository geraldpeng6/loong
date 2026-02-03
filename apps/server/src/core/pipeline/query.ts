import { spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { extname } from "path";

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

export const guessMimeType = (fileName: string): string => {
  if (!fileName) return "application/octet-stream";
  const ext = extname(fileName).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || "application/octet-stream";
};

export const createImgPipelineQuery = ({
  queryCmd,
  defaultOutputDir,
  resolveUserPath,
  env = process.env,
}: {
  queryCmd: string;
  defaultOutputDir: string;
  resolveUserPath: (value: string, baseDir?: string) => string;
  env?: NodeJS.ProcessEnv;
}) => {
  return ({ query, outputDir, top }: { query: string; outputDir?: string | null; top?: number }) =>
    new Promise<{ outputDir: string; results: unknown[] }>((resolveResult, reject) => {
      if (!queryCmd) {
        reject(
          new Error(
            "IMG_PIPELINE_DIR or IMG_PIPELINE_QUERY_CMD not set. Configure env to use pipeline query.",
          ),
        );
        return;
      }
      if (!existsSync(queryCmd)) {
        reject(new Error(`query-embed not found: ${queryCmd}`));
        return;
      }

      const resolvedOutput = outputDir ? resolveUserPath(outputDir, homedir()) : defaultOutputDir;
      const safeTop = Number.isFinite(Number(top)) ? Math.max(1, Number(top)) : 5;
      const args = [query, resolvedOutput, "--json", "--top", String(safeTop), "--paths"];

      const proc = spawn(queryCmd, args, { env: { ...env } });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => (stdout += chunk));
      proc.stderr.on("data", (chunk) => (stderr += chunk));
      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `query-embed exited with code ${code}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim() || "[]");
          resolveResult({ outputDir: resolvedOutput, results: parsed });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          reject(new Error(`Failed to parse query-embed output: ${message}`));
        }
      });
    });
};
