import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

type Logger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type AudioPipelineStatus = {
  enabled: boolean;
  running: boolean;
  pids: number[];
  pipelineDir: string;
  inputDirs: string[];
  outputDir: string;
  watchCmd: string;
  watchArgs: string[];
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
};

export type AudioPipelineConfigUpdate = {
  pipelineDir?: string;
  watchCmd?: string;
  watchArgs?: string;
  inputDirs?: string[];
  outputDir?: string;
};

export type AudioPipelineManager = {
  getStatus: () => AudioPipelineStatus;
  setEnabled: (
    enabled: boolean,
  ) => { ok: true; status: AudioPipelineStatus } | { ok: false; error: string };
  start: () => { ok: true; status: AudioPipelineStatus } | { ok: false; error: string };
  stop: () => { ok: true; status: AudioPipelineStatus } | { ok: false; error: string };
  updateConfig: (
    update: AudioPipelineConfigUpdate,
  ) => { ok: true; status: AudioPipelineStatus } | { ok: false; error: string };
};

const parseArgs = (raw?: string): string[] =>
  String(raw || "")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeDirs = (dirs?: string[]): string[] => {
  const normalized = (dirs || []).map((entry) => String(entry || "").trim()).filter(Boolean);
  return Array.from(new Set(normalized));
};

export const createAudioPipelineManager = ({
  pipelineDir,
  watchCmd,
  inputDirs,
  outputDir,
  watchArgs,
  autoStart,
  env = process.env,
  logger = console,
}: {
  pipelineDir: string;
  watchCmd?: string;
  inputDirs: string[];
  outputDir: string;
  watchArgs?: string;
  autoStart?: boolean;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
}): AudioPipelineManager => {
  let currentPipelineDir = pipelineDir;
  let watchCmdOverride = watchCmd || "";
  let currentWatchArgs = watchArgs || "";
  let currentInputDirs = normalizeDirs(inputDirs);
  let currentOutputDir = String(outputDir || "").trim();

  let enabled = false;
  let running = false;
  const processRefs = new Map<string, ReturnType<typeof spawn>>();
  let lastError: string | null = null;
  let lastExitCode: number | null = null;
  let lastExitSignal: string | null = null;

  const resolveWatchCmd = () =>
    watchCmdOverride || (currentPipelineDir ? join(currentPipelineDir, "bin", "watch-audio") : "");

  const resolveWatchArgs = () => parseArgs(currentWatchArgs);

  const getStatus = (): AudioPipelineStatus => ({
    enabled,
    running,
    pids: Array.from(processRefs.values())
      .map((proc) => proc.pid)
      .filter((pid): pid is number => typeof pid === "number"),
    pipelineDir: currentPipelineDir,
    inputDirs: currentInputDirs,
    outputDir: currentOutputDir,
    watchCmd: resolveWatchCmd(),
    watchArgs: resolveWatchArgs(),
    lastError,
    lastExitCode,
    lastExitSignal,
  });

  const stopAllProcesses = () => {
    for (const child of processRefs.values()) {
      try {
        child.kill("SIGTERM");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn?.(`[audio-pipeline] stop failed: ${message}`);
      }
    }
    processRefs.clear();
    running = false;
  };

  const startProcess = () => {
    const resolvedWatchCmd = resolveWatchCmd();
    if (!resolvedWatchCmd) {
      return {
        ok: false as const,
        error: "AUDIO_PIPELINE_DIR or AUDIO_PIPELINE_WATCH_CMD not set",
      };
    }
    if (!existsSync(resolvedWatchCmd)) {
      return { ok: false as const, error: `watch-audio not found: ${resolvedWatchCmd}` };
    }
    if (!currentOutputDir) {
      return { ok: false as const, error: "AUDIO_PIPELINE_OUTPUT_DIR not set" };
    }
    if (currentInputDirs.length === 0) {
      return { ok: false as const, error: "AUDIO_PIPELINE_INPUT_DIR not set" };
    }
    if (processRefs.size > 0) {
      return { ok: true as const, status: getStatus() };
    }

    lastError = null;
    lastExitCode = null;
    lastExitSignal = null;

    const args = resolveWatchArgs();

    for (const inputDir of currentInputDirs) {
      const child = spawn(
        resolvedWatchCmd,
        [...args, "--watch-dir", inputDir, "--output-dir", currentOutputDir],
        {
          cwd: currentPipelineDir || undefined,
          env: { ...env },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      processRefs.set(inputDir, child);

      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) logger.info?.(`[audio-pipeline] ${text}`);
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) logger.warn?.(`[audio-pipeline] ${text}`);
      });

      child.on("exit", (code, signal) => {
        processRefs.delete(inputDir);
        running = processRefs.size > 0;
        lastExitCode = typeof code === "number" ? code : null;
        lastExitSignal = signal ? String(signal) : null;
        if (enabled && !running) {
          lastError = `watch-audio exited (code=${lastExitCode ?? "n/a"}, signal=${
            lastExitSignal ?? "n/a"
          })`;
        }
      });

      child.on("error", (err) => {
        lastError = err instanceof Error ? err.message : String(err);
        logger.error?.(`[audio-pipeline] spawn error: ${lastError}`);
        processRefs.delete(inputDir);
        running = processRefs.size > 0;
      });
    }

    running = processRefs.size > 0;
    enabled = true;

    return { ok: true as const, status: getStatus() };
  };

  const stopProcess = () => {
    enabled = false;
    stopAllProcesses();
    return { ok: true as const, status: getStatus() };
  };

  const start = () => startProcess();
  const stop = () => stopProcess();

  const setEnabled = (next: boolean) => {
    if (next) return startProcess();
    return stopProcess();
  };

  const updateConfig = (update: AudioPipelineConfigUpdate) => {
    const nextInputDirs = update.inputDirs ? normalizeDirs(update.inputDirs) : currentInputDirs;
    const nextOutputDir =
      update.outputDir != null ? String(update.outputDir || "").trim() : currentOutputDir;
    const nextPipelineDir =
      update.pipelineDir != null ? String(update.pipelineDir || "").trim() : currentPipelineDir;
    const nextWatchCmd = update.watchCmd != null ? String(update.watchCmd || "") : watchCmdOverride;
    const nextWatchArgs =
      update.watchArgs != null ? String(update.watchArgs || "") : currentWatchArgs;

    const requiresRestart =
      running &&
      (nextOutputDir !== currentOutputDir ||
        nextPipelineDir !== currentPipelineDir ||
        nextWatchCmd !== watchCmdOverride ||
        nextWatchArgs !== currentWatchArgs ||
        nextInputDirs.join("|") !== currentInputDirs.join("|"));

    currentInputDirs = nextInputDirs;
    currentOutputDir = nextOutputDir;
    currentPipelineDir = nextPipelineDir;
    watchCmdOverride = nextWatchCmd;
    currentWatchArgs = nextWatchArgs;

    if (requiresRestart) {
      stopAllProcesses();
      if (enabled) {
        const result = startProcess();
        if (!result.ok) {
          return result;
        }
      }
    }

    return { ok: true as const, status: getStatus() };
  };

  if (autoStart) {
    const result = startProcess();
    if (!result.ok) {
      enabled = false;
      logger.warn?.(`[audio-pipeline] auto-start failed: ${result.error}`);
    }
  }

  return { getStatus, setEnabled, start, stop, updateConfig };
};
