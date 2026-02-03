import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { homedir } from "os";
import { normalizeBoolean, normalizeNumber, normalizeStringList } from "../utils/normalize.js";
import { resolveUserPath } from "../utils/paths.js";

type UnknownRecord = Record<string, unknown>;

type Logger = {
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? (value as UnknownRecord) : {};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseNamePair = (raw: unknown) => {
  if (!raw || typeof raw !== "string") return { zh: null, en: null };
  const trimmed = raw.trim();
  if (!trimmed) return { zh: null, en: null };
  const match = trimmed.match(/^([^()（）]+)[(（]([^()（）]+)[)）]$/);
  if (match) {
    return { zh: match[1].trim() || null, en: match[2].trim() || null };
  }
  const isAscii = /^[\x00-\x7F]+$/.test(trimmed);
  return isAscii ? { zh: null, en: trimmed } : { zh: trimmed, en: null };
};

const resolveAgentNames = (config: UnknownRecord, id: string) => {
  let nameZh = null;
  let nameEn = null;

  const nameValue = config.name;
  if (nameValue && typeof nameValue === "object") {
    const nameObj = asRecord(nameValue);
    if (typeof nameObj.zh === "string") nameZh = nameObj.zh.trim() || null;
    if (typeof nameObj.en === "string") nameEn = nameObj.en.trim() || null;
  }

  if (typeof nameValue === "string") {
    const parsed = parseNamePair(nameValue);
    nameZh = nameZh || parsed.zh;
    nameEn = nameEn || parsed.en;
  }

  if (!nameZh && !nameEn) {
    const fallback = parseNamePair(id);
    nameZh = fallback.zh;
    nameEn = fallback.en || id;
  }

  const displayName = nameZh && nameEn ? `${nameZh} (${nameEn})` : nameZh || nameEn || id;

  return { nameZh, nameEn, displayName };
};

const dedupeKeywords = (values: Array<string | null | undefined>) => {
  const seen = new Set();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = String(value).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const parseFrontmatter = (content: unknown) => {
  if (typeof content !== "string") return { frontmatter: null, body: content || "" };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { frontmatter: null, body: content };
  const raw = match[1];
  const body = content.slice(match[0].length);
  const frontmatter: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let currentKey: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let value = kv[2] ?? "";
      if (value === "") {
        frontmatter[key] = [];
        currentKey = key;
        continue;
      }
      value = value.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
      currentKey = null;
      continue;
    }
    const listMatch = trimmed.match(/^-\s*(.*)$/);
    if (listMatch && currentKey) {
      let value = listMatch[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      (frontmatter[currentKey] as string[]).push(value);
    }
  }
  return { frontmatter, body };
};

const resolveSkillPath = (value: unknown, baseDir: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~")) {
    const withoutTilde = trimmed.slice(1).replace(/^\/+/, "");
    return join(homedir(), withoutTilde);
  }
  if (trimmed.startsWith("/")) return trimmed;
  return resolve(baseDir, trimmed);
};

const resolveSkills = (value: unknown, baseDir: string) => {
  const list = normalizeStringList(value);
  if (!list || list.length === 0) return null;
  const resolved = list.map((entry) => resolveSkillPath(entry, baseDir)).filter(Boolean);
  const deduped = Array.from(new Set(resolved));
  return deduped.length > 0 ? deduped : null;
};

export const createAgentConfigLoader = ({
  loongStateDir,
  loongWorkspacesDir,
  loongSessionsDir,
  loongRuntimeChannelsDir,
  logger = console,
}: {
  loongStateDir: string;
  loongWorkspacesDir: string;
  loongSessionsDir: string;
  loongRuntimeChannelsDir: string;
  logger?: Logger;
}) => {
  const resolveWorkspaceDir = (agentId: string, override?: string | null) => {
    if (override) return resolveUserPath(override, loongWorkspacesDir);
    return join(loongWorkspacesDir, agentId);
  };

  const validateAgentNames = (configs: UnknownRecord[]) => {
    const registry = new Map();
    const errors: string[] = [];

    const register = (agentId: string, label: string, key: string) => {
      if (!key) return;
      const existing = registry.get(key);
      if (existing && existing !== agentId) {
        errors.push(`duplicate ${label} '${key}' between ${existing} and ${agentId}`);
        return;
      }
      registry.set(key, agentId);
    };

    for (const config of configs) {
      if (!config) continue;
      const id = toStringValue(config.id) || "";
      const nameZh = toStringValue(config.nameZh);
      const nameEn = toStringValue(config.nameEn);
      if (!nameZh && !nameEn) {
        errors.push(`agent ${id} missing nameZh/nameEn`);
        continue;
      }
      if (nameZh) register(id, "nameZh", `zh:${nameZh}`);
      if (nameEn) register(id, "nameEn", `en:${nameEn.toLowerCase()}`);
    }

    if (errors.length > 0) {
      for (const err of errors) {
        logger.error?.(`[loong] agent name conflict: ${err}`);
      }
      return false;
    }

    return true;
  };

  const normalizeAgentConfig = (
    config: UnknownRecord,
    configPath: string,
    gatewayConfig: UnknownRecord,
  ) => {
    if (!config || typeof config !== "object") return null;
    const configDirValue = toStringValue(config.configDir);
    const configDir = configDirValue
      ? resolveUserPath(configDirValue, dirname(configPath))
      : dirname(configPath);
    const id = toStringValue(config.id) || basename(configDir);
    const { nameZh, nameEn, displayName } = resolveAgentNames(config, id);
    const keywordSeed = Array.isArray(config.keywords) ? config.keywords.map(String) : [];
    const keywords = dedupeKeywords([...keywordSeed, nameZh, nameEn].filter(Boolean));
    if (keywords.length === 0) {
      keywords.push(id);
    }
    const workspaceDir = resolveWorkspaceDir(id, toStringValue(config.workspaceDir));
    const memoryDir = join(workspaceDir, "memory");
    const memoryIndexFile = join(workspaceDir, "MEMORY.md");
    const memoryRecord = asRecord(config.memory);
    const memoryEnabled = memoryRecord.enabled !== false;
    const sessionRootDir = toStringValue(config.sessionRootDir)
      ? resolveUserPath(String(config.sessionRootDir), loongSessionsDir)
      : join(loongSessionsDir, id);
    const sessionDir = toStringValue(config.sessionDir)
      ? resolveUserPath(String(config.sessionDir), sessionRootDir)
      : join(sessionRootDir, "transcripts");
    const sessionIndexFile = toStringValue(config.sessionIndexFile)
      ? resolveUserPath(String(config.sessionIndexFile), sessionRootDir)
      : join(sessionRootDir, "sessions.json");
    const imessageRecord = asRecord(config.imessage);
    const sessionMapOverride = toStringValue(imessageRecord.sessionMapFile);
    const sessionMapFile = sessionMapOverride
      ? resolveUserPath(sessionMapOverride, loongRuntimeChannelsDir)
      : join(loongRuntimeChannelsDir, "imessage", "session-map", `${id}.json`);

    const systemPromptPath = toStringValue(config.systemPromptPath)
      ? resolve(configDir, String(config.systemPromptPath))
      : null;
    const appendSystemPromptPath = toStringValue(config.appendSystemPromptPath)
      ? resolve(configDir, String(config.appendSystemPromptPath))
      : null;

    const modelRecord = asRecord(config.model);
    const modelProvider = toStringValue(modelRecord.provider);
    const modelId = toStringValue(modelRecord.modelId);
    const model =
      modelProvider || modelId ? { modelId: modelId || null, provider: modelProvider } : null;
    const thinkingLevel = toStringValue(config.thinkingLevel) || toStringValue(config.thinking);
    const tools = Array.isArray(config.tools) ? config.tools : null;
    const skills = Array.isArray(config.skills) ? config.skills : null;
    const subagentsRecord = asRecord(config.subagents);
    const notifyOnStart =
      config.notifyOnStart !== undefined ? config.notifyOnStart : gatewayConfig.notifyOnStart;
    const replyPrefixMode =
      toStringValue(config.replyPrefixMode) || toStringValue(gatewayConfig.replyPrefixMode);

    return {
      id,
      name: displayName,
      nameZh,
      nameEn,
      keywords,
      configDir,
      systemPrompt: config.systemPrompt || null,
      systemPromptPath,
      appendSystemPrompt: config.appendSystemPrompt || null,
      appendSystemPromptPath,
      model,
      thinkingLevel: thinkingLevel ? String(thinkingLevel).trim() : null,
      tools,
      skills,
      noSkills: config.noSkills === true,
      workspaceDir,
      sessionRootDir,
      sessionDir,
      sessionIndexFile,
      memoryDir,
      memoryIndexFile,
      memoryEnabled,
      sessionMapFile,
      subagents: {
        allowAgents: subagentsRecord.allowAgents ?? null,
        maxDepth: subagentsRecord.maxDepth ?? null,
      },
      notifyOnStart,
      replyPrefixMode: replyPrefixMode || null,
    };
  };

  const resolveAgentConfigs = (gatewayConfig: UnknownRecord) => {
    const agentsDir = join(homedir(), ".pi", "agent", "agents");
    const results: UnknownRecord[] = [];

    if (!existsSync(agentsDir)) {
      logger.warn?.(`[loong] pi agents dir not found: ${agentsDir}`);
      return results;
    }

    const entries = readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!entry.name.endsWith(".md")) continue;
      const filePath = join(agentsDir, entry.name);
      let raw: string;
      try {
        raw = readFileSync(filePath, "utf8");
      } catch (err) {
        logger.error?.(`[loong] failed to read pi agent: ${filePath} (${err.message})`);
        continue;
      }
      const { frontmatter, body } = parseFrontmatter(raw);
      const frontmatterRecord = asRecord(frontmatter);
      const name = toStringValue(frontmatterRecord.name) || "";
      const description = toStringValue(frontmatterRecord.description) || "";
      if (!name || !description) {
        logger.warn?.(`[loong] pi agent missing name/description: ${filePath}`);
        continue;
      }

      const keywords = normalizeStringList(frontmatterRecord.keywords ?? frontmatterRecord.keyword);
      const tools = normalizeStringList(frontmatterRecord.tools);
      const skills = resolveSkills(frontmatterRecord.skills, dirname(filePath));
      const noSkills = normalizeBoolean(frontmatterRecord.noSkills) ?? false;
      const modelId = toStringValue(frontmatterRecord.model);
      const provider = toStringValue(frontmatterRecord.provider);
      const thinkingLevel =
        toStringValue(frontmatterRecord.thinkingLevel) || toStringValue(frontmatterRecord.thinking);
      const workspaceOverride = toStringValue(frontmatterRecord.workspace);
      const subagentsAllowAgents = normalizeStringList(
        frontmatterRecord.subagentsAllowAgents ?? frontmatterRecord.subagentsAllow,
      );
      const subagentsMaxDepth = normalizeNumber(frontmatterRecord.subagentsMaxDepth);

      const agentConfig: UnknownRecord = {
        id: name,
        name,
        keywords,
        systemPrompt: body.trim() || null,
        model:
          modelId || provider ? { modelId: modelId || null, provider: provider || null } : null,
        thinkingLevel: thinkingLevel ? String(thinkingLevel).trim() : null,
        tools,
        skills,
        noSkills: noSkills || null,
        subagents: {
          allowAgents: subagentsAllowAgents,
          maxDepth: subagentsMaxDepth,
        },
        workspaceDir: workspaceOverride ? resolveWorkspaceDir(name, workspaceOverride) : null,
        configDir: dirname(filePath),
      };

      const syntheticPath = join(loongStateDir, "agents", name, "agent.json");
      const normalized = normalizeAgentConfig(agentConfig, syntheticPath, gatewayConfig);
      if (normalized) results.push(normalized);
    }

    return results;
  };

  return {
    resolveAgentConfigs,
    validateAgentNames,
  };
};
