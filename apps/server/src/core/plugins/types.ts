import type { RouteHandler } from "../http/types.js";

export type AgentPayloadTransform = (agent: unknown, payload: unknown) => unknown;

export type PluginService = {
  id: string;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
};

export type PluginApi = {
  id: string;
  rootDir: string;
  config: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  logger: Console;
  notifyLocalOnly: boolean;
  maxBodyBytes: number;
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  resolvePath: (value: string) => string;
  registerRoutes: (routes: RouteHandler | RouteHandler[]) => void;
  registerAgentPayloadTransform: (transform: AgentPayloadTransform) => void;
  registerAgentExtensions: (paths: string | string[]) => void;
  registerService: (service: PluginService) => void;
};

export type LoongPlugin = {
  id?: string;
  name?: string;
  description?: string;
  register: (api: PluginApi) => void | Promise<void>;
};

export type PluginManifest = {
  id: string;
  name?: string;
  description?: string;
  entry?: string;
  enabledByDefault?: boolean;
  configSchema?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
  skills?: string[];
};

export type PluginConfigEntry = {
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type PluginsConfig = {
  enabled?: boolean;
  allow?: string[];
  deny?: string[];
  load?: { paths?: string[] };
  entries?: Record<string, PluginConfigEntry>;
};

export type LoadedPlugin = {
  id: string;
  rootDir: string;
  manifest: PluginManifest;
  enabled: boolean;
};
