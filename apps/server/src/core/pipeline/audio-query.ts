import { spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";

export const createAudioPipelineQuery = ({
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
            "AUDIO_PIPELINE_DIR or AUDIO_PIPELINE_QUERY_CMD not set. Configure env to use audio pipeline query.",
          ),
        );
        return;
      }
      if (!existsSync(queryCmd)) {
        reject(new Error(`query-audio not found: ${queryCmd}`));
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
          reject(new Error(stderr || `query-audio exited with code ${code}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim() || "[]");
          resolveResult({ outputDir: resolvedOutput, results: parsed });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          reject(new Error(`Failed to parse query-audio output: ${message}`));
        }
      });
    });
};
