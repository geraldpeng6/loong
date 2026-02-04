import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { RouteHandler } from "../../core/http/types.js";
import { createImgPipelineQuery, guessMimeType } from "../../core/pipeline/query.js";
import { normalizeStringList } from "../../core/utils/normalize.js";
import {
  createImgPipelineManager,
  type ImgPipelineConfigUpdate,
  type ImgPipelineManager,
} from "./manager.js";
import { createPipelineAttachmentTransformer } from "./attachments.js";
import { createImgPipelineRoutes } from "./routes.js";

const parseEnvFlag = (value: string | undefined) =>
  ["1", "true", "yes"].includes(String(value || "").toLowerCase());

const parseEnvList = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeDirs = (dirs: string[]) =>
  Array.from(new Set(dirs.map((dir) => dir.trim()).filter(Boolean)));

// Get built-in pipeline path relative to server directory
const getBuiltinPipelinePath = () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const serverDir = resolve(__dirname, "..", "..", "..");
  const builtinPath = join(serverDir, "bin", "img-pipeline");
  return existsSync(builtinPath) ? builtinPath : "";
};

export type ImgPipelineFeature = {
  routes: RouteHandler[];
  transformAgentPayload: (agent: unknown, payload: unknown) => unknown;
  extensions: string[];
  manager: ImgPipelineManager | null;
};

export const initImgPipelineFeature = ({
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
}): ImgPipelineFeature => {
  const builtinPipelineDir = getBuiltinPipelinePath();
  const pipelineDirEnv = env.IMG_PIPELINE_DIR || builtinPipelineDir;
  const queryCmdOverride = env.IMG_PIPELINE_QUERY_CMD || "";
  const watchCmdOverride = env.IMG_PIPELINE_WATCH_CMD || "";
  const outputDirEnv = env.IMG_PIPELINE_OUTPUT_DIR || join(homedir(), "output");
  const fallbackInputDir = (() => {
    const lower = join(homedir(), "downloads");
    if (existsSync(lower)) return lower;
    const upper = join(homedir(), "Downloads");
    if (existsSync(upper)) return upper;
    return join(homedir(), "data");
  })();
  const inputDirsEnvRaw = parseEnvList(env.IMG_PIPELINE_INPUT_DIRS || env.IMG_PIPELINE_INPUT_DIR);
  const inputDirsEnv = inputDirsEnvRaw.length > 0 ? inputDirsEnvRaw : [fallbackInputDir];
  const watchArgs = env.IMG_PIPELINE_WATCH_ARGS || "";
  const autoStart = !["0", "false", "no"].includes(
    String(env.IMG_PIPELINE_AUTO_START || "true").toLowerCase(),
  );
  const allowRootsRaw = parseEnvList(env.IMG_PIPELINE_ALLOW_ROOTS);
  let allowRoots = allowRootsRaw.length > 0 ? allowRootsRaw : [...inputDirsEnv, outputDirEnv];
  const maxTop = Number(env.IMG_PIPELINE_MAX_TOP || 20);
  const maxBytes = Number(env.IMG_PIPELINE_MAX_BYTES || 5 * 1024 * 1024);
  const maxTotalBytes = Number(env.IMG_PIPELINE_MAX_TOTAL_BYTES || 20 * 1024 * 1024);

  const flagRaw = env.LOONG_FEATURE_IMG_PIPELINE;
  const hasExplicitFlag = flagRaw != null && flagRaw !== "";
  const enabled = hasExplicitFlag
    ? parseEnvFlag(flagRaw)
    : Boolean(pipelineDirEnv || queryCmdOverride || watchCmdOverride);

  let currentPipelineDir = pipelineDirEnv.trim();
  let currentOutputDir = outputDirEnv.trim();
  let currentInputDirs = normalizeDirs(inputDirsEnv);
  let currentQueryCmd =
    queryCmdOverride || (currentPipelineDir ? join(currentPipelineDir, "bin", "query-embed") : "");
  let currentWatchCmd =
    watchCmdOverride || (currentPipelineDir ? join(currentPipelineDir, "bin", "watch-images") : "");

  let runImgPipelineQuery = createImgPipelineQuery({
    queryCmd: currentQueryCmd,
    defaultOutputDir: currentOutputDir,
    resolveUserPath,
    env,
  });

  const manager = createImgPipelineManager({
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
    `/api/pipeline/file?path=${encodeURIComponent(filePath)}`;
  let attachmentTransformer = createPipelineAttachmentTransformer({
    resolveUserPath,
    buildFileUrl,
    allowedRoots: allowRoots,
    logger,
  });
  const transformAgentPayload = (_agent: unknown, payload: unknown) =>
    attachmentTransformer(payload as Record<string, unknown>);

  const updateConfig = (update: ImgPipelineConfigUpdate) => {
    const nextPipelineDir =
      update.pipelineDir != null ? String(update.pipelineDir || "").trim() : currentPipelineDir;
    const nextOutputDir =
      update.outputDir != null ? String(update.outputDir || "").trim() : currentOutputDir;
    const nextInputDirs = update.inputDirs ? normalizeDirs(update.inputDirs) : currentInputDirs;

    const nextWatchCmd =
      watchCmdOverride || (nextPipelineDir ? join(nextPipelineDir, "bin", "watch-images") : "");
    const nextQueryCmd =
      queryCmdOverride || (nextPipelineDir ? join(nextPipelineDir, "bin", "query-embed") : "");

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

    runImgPipelineQuery = createImgPipelineQuery({
      queryCmd: currentQueryCmd,
      defaultOutputDir: currentOutputDir,
      resolveUserPath,
      env,
    });

    attachmentTransformer = createPipelineAttachmentTransformer({
      resolveUserPath,
      buildFileUrl,
      allowedRoots: allowRoots,
      logger,
    });

    return updateResult;
  };

  const routes = createImgPipelineRoutes({
    notifyLocalOnly,
    runImgPipelineQuery: (payload) => runImgPipelineQuery(payload as Record<string, unknown>),
    normalizeStringList,
    resolveUserPath,
    guessMimeType,
    imgPipelineMaxTop: maxTop,
    imgPipelineMaxBytes: maxBytes,
    imgPipelineMaxTotalBytes: maxTotalBytes,
    imgPipelineManager: manager,
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
