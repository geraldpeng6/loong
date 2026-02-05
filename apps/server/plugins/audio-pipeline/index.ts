import type { LoongPlugin, PluginApi } from "../../src/core/plugins/types.js";
import { initAudioPipelineFeature } from "../../src/features/audio-pipeline/index.js";

type AudioPipelinePluginConfig = {
  enabled?: boolean;
  pipelineDir?: string;
  queryCmd?: string;
  watchCmd?: string;
  inputDirs?: string[] | string;
  outputDir?: string;
  watchArgs?: string;
  autoStart?: boolean;
  allowRoots?: string[] | string;
  maxTop?: number;
  maxBytes?: number;
  maxTotalBytes?: number;
};

const normalizeList = (value?: string[] | string) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const applyConfigToEnv = (env: NodeJS.ProcessEnv, config: AudioPipelinePluginConfig) => {
  if (typeof config.enabled === "boolean") {
    env.LOONG_FEATURE_AUDIO_PIPELINE = config.enabled ? "1" : "0";
  }
  if (config.pipelineDir) env.AUDIO_PIPELINE_DIR = config.pipelineDir;
  if (config.queryCmd) env.AUDIO_PIPELINE_QUERY_CMD = config.queryCmd;
  if (config.watchCmd) env.AUDIO_PIPELINE_WATCH_CMD = config.watchCmd;
  if (config.outputDir) env.AUDIO_PIPELINE_OUTPUT_DIR = config.outputDir;
  if (config.watchArgs) env.AUDIO_PIPELINE_WATCH_ARGS = config.watchArgs;
  if (typeof config.autoStart === "boolean") {
    env.AUDIO_PIPELINE_AUTO_START = config.autoStart ? "1" : "0";
  }
  if (config.inputDirs) {
    const dirs = normalizeList(config.inputDirs);
    if (dirs.length > 0) env.AUDIO_PIPELINE_INPUT_DIRS = dirs.join(",");
  }
  if (config.allowRoots) {
    const roots = normalizeList(config.allowRoots);
    if (roots.length > 0) env.AUDIO_PIPELINE_ALLOW_ROOTS = roots.join(",");
  }
  if (typeof config.maxTop === "number") env.AUDIO_PIPELINE_MAX_TOP = String(config.maxTop);
  if (typeof config.maxBytes === "number") env.AUDIO_PIPELINE_MAX_BYTES = String(config.maxBytes);
  if (typeof config.maxTotalBytes === "number") {
    env.AUDIO_PIPELINE_MAX_TOTAL_BYTES = String(config.maxTotalBytes);
  }
};

const registerAudioPipeline = async (api: PluginApi) => {
  const config = (api.config || {}) as AudioPipelinePluginConfig;
  const env = { ...api.env };
  applyConfigToEnv(env, config);

  const feature = initAudioPipelineFeature({
    resolveUserPath: api.resolveUserPath,
    notifyLocalOnly: api.notifyLocalOnly,
    maxBodyBytes: api.maxBodyBytes,
    logger: api.logger,
    env,
  });

  if (feature.routes.length > 0) {
    api.registerRoutes(feature.routes);
  }
  api.registerAgentPayloadTransform(feature.transformAgentPayload);
  if (feature.extensions.length > 0) {
    api.registerAgentExtensions(feature.extensions);
  }
  if (feature.manager) {
    api.registerService({
      id: "audio-pipeline",
      start: () => {
        feature.manager?.start();
      },
      stop: () => {
        feature.manager?.stop();
      },
    });
  }
};

const plugin: LoongPlugin = {
  id: "audio-pipeline",
  name: "Audio Pipeline",
  description: "Watch audio directories and expose transcription search.",
  register: registerAudioPipeline,
};

export default plugin;
