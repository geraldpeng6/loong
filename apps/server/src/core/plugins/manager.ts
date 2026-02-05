import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import type { RouteHandler } from "../http/types.js";
import type {
  AgentPayloadTransform,
  LoadedPlugin,
  LoongPlugin,
  PluginApi,
  PluginManifest,
  PluginsConfig,
  PluginService,
} from "./types.js";

const MANIFEST_FILES = ["loong.plugin.json", "openclaw.plugin.json"];

type PluginManagerOptions = {
  config?: PluginsConfig;
  env?: NodeJS.ProcessEnv;
  logger?: Console;
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  notifyLocalOnly: boolean;
  maxBodyBytes: number;
  bundledDir?: string;
  globalDir?: string;
  workspaceDir?: string;
  configBaseDir?: string;
};

export type PluginManager = {
  plugins: LoadedPlugin[];
  routes: RouteHandler[];
  agentExtensions: string[];
  agentPayloadTransforms: AgentPayloadTransform[];
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeStringList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const loadManifest = (dir: string, logger: Console): PluginManifest | null => {
  for (const fileName of MANIFEST_FILES) {
    const manifestPath = join(dir, fileName);
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = readFileSync(manifestPath, "utf8");
      return JSON.parse(raw) as PluginManifest;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] failed to read plugin manifest ${manifestPath}: ${message}`);
      return null;
    }
  }
  return null;
};

const collectPluginRoots = ({ paths, logger }: { paths: string[]; logger: Console }): string[] => {
  const roots = new Set<string>();

  const addRoot = (dir: string) => {
    if (!dir || roots.has(dir)) return;
    const manifest = loadManifest(dir, logger);
    if (manifest?.id) {
      roots.add(dir);
      return;
    }
    let children: ReturnType<typeof readdirSync>;
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] failed to read plugin dir ${dir}: ${message}`);
      return;
    }
    for (const entry of children) {
      if (!entry.isDirectory()) continue;
      const childDir = join(dir, entry.name);
      const childManifest = loadManifest(childDir, logger);
      if (childManifest?.id) {
        roots.add(childDir);
      }
    }
  };

  for (const entry of paths) {
    if (!entry) continue;
    try {
      const stat = statSync(entry);
      if (stat.isDirectory()) {
        addRoot(entry);
      } else if (stat.isFile()) {
        addRoot(dirname(entry));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] plugin path not accessible: ${entry} (${message})`);
    }
  }

  return Array.from(roots);
};

const validateConfig = (
  schema: Record<string, unknown> | undefined,
  config: Record<string, unknown>,
): { ok: true } | { ok: false; errors: string[] } => {
  if (!schema) return { ok: true };
  const errors: string[] = [];

  const schemaType = schema.type;
  if (schemaType === "object") {
    if (!isPlainObject(config)) {
      errors.push("config must be an object");
      return { ok: false, errors };
    }
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const additionalProperties = schema.additionalProperties !== false;

    if (!additionalProperties) {
      for (const key of Object.keys(config)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`unknown config field: ${key}`);
        }
      }
    }

    for (const [key, value] of Object.entries(config)) {
      const definition = properties[key];
      if (!isPlainObject(definition)) continue;
      const type = definition.type;
      if (!type) continue;
      if (type === "string" && typeof value !== "string") {
        errors.push(`config.${key} must be string`);
      } else if (type === "number" && typeof value !== "number") {
        errors.push(`config.${key} must be number`);
      } else if (type === "boolean" && typeof value !== "boolean") {
        errors.push(`config.${key} must be boolean`);
      } else if (type === "array" && !Array.isArray(value)) {
        errors.push(`config.${key} must be array`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
};

export const createPluginManager = async ({
  config,
  env = process.env,
  logger = console,
  resolveUserPath,
  notifyLocalOnly,
  maxBodyBytes,
  bundledDir,
  globalDir,
  workspaceDir,
  configBaseDir,
}: PluginManagerOptions): Promise<PluginManager> => {
  const normalizedConfig: PluginsConfig = {
    enabled: config?.enabled !== false,
    allow: normalizeStringList(config?.allow),
    deny: normalizeStringList(config?.deny),
    load: { paths: normalizeStringList(config?.load?.paths) },
    entries: isPlainObject(config?.entries) ? (config?.entries as PluginsConfig["entries"]) : {},
  };

  const loadPaths = [
    ...normalizedConfig.load.paths,
    ...(workspaceDir ? [workspaceDir] : []),
    ...(globalDir ? [globalDir] : []),
    ...(bundledDir ? [bundledDir] : []),
  ]
    .map((entry) => resolveUserPath(entry, configBaseDir))
    .filter(Boolean);

  const roots = collectPluginRoots({ paths: loadPaths, logger });
  const plugins: LoadedPlugin[] = [];
  const routes: RouteHandler[] = [];
  const agentExtensions: string[] = [];
  const agentPayloadTransforms: AgentPayloadTransform[] = [];
  const services: PluginService[] = [];

  const registerRoutes = (entries: RouteHandler | RouteHandler[]) => {
    if (Array.isArray(entries)) {
      routes.push(...entries.filter(Boolean));
    } else if (entries) {
      routes.push(entries);
    }
  };

  const registerAgentExtensions = (paths: string[], rootDir: string) => {
    for (const entry of paths) {
      const resolved = resolveUserPath(entry, rootDir);
      if (!resolved) continue;
      if (!existsSync(resolved)) {
        logger.warn?.(`[loong] plugin extension not found: ${resolved}`);
        continue;
      }
      agentExtensions.push(resolved);
    }
  };

  const seenIds = new Set<string>();

  for (const rootDir of roots) {
    const manifest = loadManifest(rootDir, logger);
    if (!manifest?.id) continue;

    const id = manifest.id;
    if (seenIds.has(id)) {
      logger.warn?.(`[loong] duplicate plugin id "${id}" at ${rootDir}; skipping`);
      continue;
    }
    seenIds.add(id);

    const entryConfig = normalizedConfig.entries?.[id];
    const enabledByDefault = manifest.enabledByDefault ?? false;
    const explicitlyEnabled = entryConfig?.enabled;
    const allowed = normalizedConfig.allow.length === 0 || normalizedConfig.allow.includes(id);
    const denied = normalizedConfig.deny.includes(id);
    const enabled = Boolean(
      normalizedConfig.enabled && allowed && !denied && (explicitlyEnabled ?? enabledByDefault),
    );

    plugins.push({ id, rootDir, manifest, enabled });

    if (!enabled) continue;

    const configValue = isPlainObject(entryConfig?.config) ? entryConfig?.config : {};
    const validation = validateConfig(
      isPlainObject(manifest.configSchema) ? manifest.configSchema : undefined,
      configValue,
    );
    if (!validation.ok) {
      logger.warn?.(`[loong] plugin "${id}" config invalid: ${validation.errors.join("; ")}`);
      continue;
    }

    const entryPath = join(rootDir, manifest.entry || "index.ts");
    if (!existsSync(entryPath)) {
      logger.warn?.(`[loong] plugin entry not found: ${entryPath}`);
      continue;
    }

    let pluginModule: LoongPlugin | ((api: PluginApi) => void | Promise<void>) | null = null;
    try {
      const mod = await import(pathToFileURL(entryPath).href);
      pluginModule = (mod.default || mod) as LoongPlugin;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] failed to load plugin "${id}": ${message}`);
      continue;
    }

    if (
      pluginModule &&
      typeof pluginModule === "object" &&
      "id" in pluginModule &&
      pluginModule.id &&
      pluginModule.id !== id
    ) {
      logger.warn?.(`[loong] plugin id mismatch: manifest "${id}" vs module "${pluginModule.id}"`);
    }

    const registerFn =
      typeof pluginModule === "function"
        ? pluginModule
        : typeof pluginModule?.register === "function"
          ? pluginModule.register
          : null;

    if (!registerFn) {
      logger.warn?.(`[loong] plugin "${id}" has no register() function`);
      continue;
    }

    const api: PluginApi = {
      id,
      rootDir,
      config: configValue,
      env,
      logger,
      notifyLocalOnly,
      maxBodyBytes,
      resolveUserPath,
      resolvePath: (value: string) => resolveUserPath(value, rootDir),
      registerRoutes: (entries) => registerRoutes(entries),
      registerAgentPayloadTransform: (transform) => {
        if (transform) agentPayloadTransforms.push(transform);
      },
      registerAgentExtensions: (paths) => {
        const entries = Array.isArray(paths) ? paths : [paths];
        registerAgentExtensions(entries, rootDir);
      },
      registerService: (service) => {
        if (!service?.id || typeof service.start !== "function") {
          logger.warn?.(`[loong] plugin "${id}" registered invalid service`);
          return;
        }
        services.push(service);
      },
    };

    try {
      await registerFn(api);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn?.(`[loong] plugin "${id}" register() failed: ${message}`);
    }
  }

  const startAll = async () => {
    for (const service of services) {
      try {
        await service.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn?.(`[loong] plugin service "${service.id}" start failed: ${message}`);
      }
    }
  };

  const stopAll = async () => {
    for (const service of services.slice().reverse()) {
      if (typeof service.stop !== "function") continue;
      try {
        await service.stop();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn?.(`[loong] plugin service "${service.id}" stop failed: ${message}`);
      }
    }
  };

  return {
    plugins,
    routes,
    agentExtensions,
    agentPayloadTransforms,
    startAll,
    stopAll,
  };
};
