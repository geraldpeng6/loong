import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { RouteHandler } from "../../core/http/types.js";
import { createAudioPipelineQuery } from "../../core/pipeline/audio-query.js";
import {
  createAudioPipelineManager,
  type AudioPipelineConfigUpdate,
  type AudioPipelineManager,
} from "./manager.js";
import { createAudioPipelineAttachmentTransformer } from "./attachments.js";
import { createAudioPipelineRoutes } from "./routes.js";

const parseEnvFlag = (value: string | undefined) =>
  ["1", "true", "yes"].includes(String(value || "").toLowerCase());

const parseEnvList = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeDirs = (dirs: string[]) =>
  Array.from(new Set(dirs.map((dir) => dir.trim()).filter(Boolean)));

export type AudioPipelineFeature = {
  routes: RouteHandler[];
  transformAgentPayload: (agent: unknown, payload: unknown) => unknown;
  extensions: string[];
  manager: AudioPipelineManager | null;
};

export const initAudioPipelineFeature = ({
  resolveUserPath,
  notifyLocalOnly,
  maxBodyBytes,
  logger = console,
  env = process.env,
}: {
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  notifyLocalOnly: boolean;
  maxBodyBytes: number;
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
  env?: NodeJS.ProcessEnv;
}): AudioPipelineFeature => {
  const pipelineDirEnv = env.AUDIO_PIPELINE_DIR || join(homedir(), "projects", "audio-pipeline");
  const queryCmdOverride = env.AUDIO_PIPELINE_QUERY_CMD || "";
  const watchCmdOverride = env.AUDIO_PIPELINE_WATCH_CMD || "";
  const outputDirEnv = env.AUDIO_PIPELINE_OUTPUT_DIR || join(pipelineDirEnv, "output");
  const inputDirsEnvRaw = parseEnvList(
    env.AUDIO_PIPELINE_INPUT_DIRS || env.AUDIO_PIPELINE_INPUT_DIR,
  );
  const inputDirsEnv =
    inputDirsEnvRaw.length > 0 ? inputDirsEnvRaw : [join(homedir(), "data", "audio")];
  const watchArgs = env.AUDIO_PIPELINE_WATCH_ARGS || "";
  const autoStart = !["0", "false", "no"].includes(
    String(env.AUDIO_PIPELINE_AUTO_START || "true").toLowerCase(),
  );
  const allowRootsRaw = parseEnvList(env.AUDIO_PIPELINE_ALLOW_ROOTS);
  let allowRoots = allowRootsRaw.length > 0 ? allowRootsRaw : [...inputDirsEnv, outputDirEnv];
  const maxTop = Number(env.AUDIO_PIPELINE_MAX_TOP || 20);
  const maxBytes = Number(env.AUDIO_PIPELINE_MAX_BYTES || 50 * 1024 * 1024);
  const maxTotalBytes = Number(env.AUDIO_PIPELINE_MAX_TOTAL_BYTES || 200 * 1024 * 1024);

  const flagRaw = env.LOONG_FEATURE_AUDIO_PIPELINE;
  const hasExplicitFlag = flagRaw != null && flagRaw !== "";
  const enabled = hasExplicitFlag ? parseEnvFlag(flagRaw) : Boolean(existsSync(pipelineDirEnv));

  let currentPipelineDir = pipelineDirEnv.trim();
  let currentOutputDir = outputDirEnv.trim();
  let currentInputDirs = normalizeDirs(inputDirsEnv);
  let currentQueryCmd =
    queryCmdOverride || (currentPipelineDir ? join(currentPipelineDir, "bin", "query-audio") : "");
  let currentWatchCmd =
    watchCmdOverride || (currentPipelineDir ? join(currentPipelineDir, "bin", "watch-audio") : "");

  let runAudioPipelineQuery = createAudioPipelineQuery({
    queryCmd: currentQueryCmd,
    defaultOutputDir: currentOutputDir,
    resolveUserPath,
    env,
  });

  const manager = createAudioPipelineManager({
    pipelineDir: currentPipelineDir,
    watchCmd: currentWatchCmd,
    inputDirs: currentInputDirs,
    outputDir: currentOutputDir,
    watchArgs,
    autoStart: enabled && autoStart,
    env,
    logger,
  });

  const buildFileUrl = (filePath: string) =>
    `/api/audio-pipeline/file?path=${encodeURIComponent(filePath)}`;
  let attachmentTransformer = createAudioPipelineAttachmentTransformer({
    resolveUserPath,
    buildFileUrl,
    allowedRoots: allowRoots,
    logger,
  });
  const transformAgentPayload = (_agent: unknown, payload: unknown) =>
    attachmentTransformer(payload as Record<string, unknown>);

  const updateConfig = (update: AudioPipelineConfigUpdate) => {
    const nextPipelineDir =
      update.pipelineDir != null ? String(update.pipelineDir || "").trim() : currentPipelineDir;
    const nextOutputDir =
      update.outputDir != null ? String(update.outputDir || "").trim() : currentOutputDir;
    const nextInputDirs = update.inputDirs ? normalizeDirs(update.inputDirs) : currentInputDirs;

    const nextWatchCmd =
      watchCmdOverride || (nextPipelineDir ? join(nextPipelineDir, "bin", "watch-audio") : "");
    const nextQueryCmd =
      queryCmdOverride || (nextPipelineDir ? join(nextPipelineDir, "bin", "query-audio") : "");

    const nextAllowRoots =
      allowRootsRaw.length > 0 ? allowRootsRaw : [...nextInputDirs, nextOutputDir];

    currentPipelineDir = nextPipelineDir;
    currentOutputDir = nextOutputDir;
    currentInputDirs = nextInputDirs;
    currentWatchCmd = nextWatchCmd;
    currentQueryCmd = nextQueryCmd;
    allowRoots = nextAllowRoots;

    const updateResult = manager.updateConfig({
      pipelineDir: currentPipelineDir,
      watchCmd: currentWatchCmd,
      inputDirs: currentInputDirs,
      outputDir: currentOutputDir,
      watchArgs,
    });

    if (!updateResult.ok) {
      return updateResult;
    }

    runAudioPipelineQuery = createAudioPipelineQuery({
      queryCmd: currentQueryCmd,
      defaultOutputDir: currentOutputDir,
      resolveUserPath,
      env,
    });

    attachmentTransformer = createAudioPipelineAttachmentTransformer({
      resolveUserPath,
      buildFileUrl,
      allowedRoots: allowRoots,
      logger,
    });

    return updateResult;
  };

  const routes = createAudioPipelineRoutes({
    notifyLocalOnly,
    runAudioPipelineQuery: (payload) => runAudioPipelineQuery(payload as Record<string, unknown>),
    resolveUserPath,
    audioPipelineMaxTop: maxTop,
    audioPipelineMaxBytes: maxBytes,
    audioPipelineMaxTotalBytes: maxTotalBytes,
    audioPipelineManager: manager,
    pipelineAllowRoots: allowRoots,
    getPipelineAllowRoots: () => allowRoots,
    updatePipelineConfig: updateConfig,
    maxBodyBytes,
  });

  const featureDir = dirname(fileURLToPath(import.meta.url));
  const extensionPath = resolve(featureDir, "extension.ts");
  const extensions = currentQueryCmd ? [extensionPath] : [];

  return {
    routes,
    transformAgentPayload,
    extensions,
    manager,
  };
};
