import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  copyFileSync,
  unlinkSync,
} from "fs";
import { dirname, join, resolve, basename, relative, sep } from "path";

type SessionAgent = {
  id: string;
  sessionDir: string;
  sessionRootDir?: string | null;
  sessionIndexFile?: string | null;
};

type SessionIndexEntry = {
  id?: string;
  label?: string;
  path?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  sizeBytes?: number | null;
};

type SessionIndex = {
  version: number;
  agentId?: string;
  updatedAt?: string | null;
  sessions: SessionIndexEntry[];
};

type SessionInfo = {
  sessionId: string;
  sessionPath: string;
  label?: string | null;
  createdAt?: string | null;
};

export const formatSessionSize = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export const listSessionFiles = (rootDir?: string | null) => {
  if (!rootDir || !existsSync(rootDir)) return [];
  const results: string[] = [];
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }

  return results;
};

export const readSessionIndex = (agent: SessionAgent): SessionIndex => {
  if (!agent.sessionIndexFile) {
    return { version: 1, agentId: agent.id, updatedAt: null, sessions: [] };
  }
  if (!existsSync(agent.sessionIndexFile)) {
    return { version: 1, agentId: agent.id, updatedAt: null, sessions: [] };
  }
  try {
    const raw = readFileSync(agent.sessionIndexFile, "utf8");
    const parsed = JSON.parse(raw);
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions.filter(Boolean) : [];
    return {
      version: typeof parsed?.version === "number" ? parsed.version : 1,
      agentId: parsed?.agentId || agent.id,
      updatedAt: parsed?.updatedAt || null,
      sessions,
    };
  } catch (err) {
    console.warn(`[loong] failed to read session index: ${err.message}`);
    return { version: 1, agentId: agent.id, updatedAt: null, sessions: [] };
  }
};

export const writeSessionIndex = (agent: SessionAgent, index: SessionIndex) => {
  if (!agent.sessionIndexFile) return;
  try {
    mkdirSync(dirname(agent.sessionIndexFile), { recursive: true });
    writeFileSync(agent.sessionIndexFile, JSON.stringify(index, null, 2));
  } catch (err) {
    console.warn(`[loong] failed to write session index: ${err.message}`);
  }
};

export const resolveSessionIndexPath = (agent: SessionAgent, entry?: SessionIndexEntry | null) => {
  const baseDir = agent.sessionRootDir || agent.sessionDir;
  const raw = entry?.path;
  if (raw && typeof raw === "string") {
    if (raw.startsWith("/")) return raw;
    return resolve(baseDir, raw);
  }
  if (entry?.id) return join(agent.sessionDir, `${entry.id}.jsonl`);
  return "";
};

export const syncSessionIndex = (agent: SessionAgent) => {
  const index = readSessionIndex(agent);
  const sessionFiles = listSessionFiles(agent.sessionDir).sort();
  const sessionsById = new Map(
    index.sessions
      .filter((entry) => entry && typeof entry.id === "string")
      .map((entry) => [entry.id as string, entry]),
  );
  const nextSessions: SessionIndexEntry[] = [];
  let changed = false;
  const baseDir = agent.sessionRootDir || agent.sessionDir;

  for (const filePath of sessionFiles) {
    const id = basename(filePath).replace(/\.jsonl$/, "");
    const prev = sessionsById.get(id) || {};
    let stats = null;
    try {
      stats = statSync(filePath);
    } catch {
      stats = null;
    }
    const relPath = relative(baseDir, filePath).replace(/\\/g, "/");
    const createdAt =
      prev.createdAt || (stats ? new Date(stats.birthtimeMs || stats.mtimeMs).toISOString() : null);
    const updatedAt = stats ? new Date(stats.mtimeMs).toISOString() : prev.updatedAt || createdAt;
    const sizeBytes = stats ? stats.size : prev.sizeBytes;
    const label = prev.label || id;
    const nextEntry: SessionIndexEntry = {
      ...prev,
      id,
      label,
      path: relPath,
      createdAt,
      updatedAt,
      sizeBytes,
    };
    nextSessions.push(nextEntry);
    if (
      !prev.id ||
      prev.path !== relPath ||
      prev.sizeBytes !== sizeBytes ||
      prev.updatedAt !== updatedAt
    ) {
      changed = true;
    }
  }

  if (nextSessions.length !== index.sessions.length) {
    changed = true;
  }

  const nextIndex: SessionIndex = {
    version: 1,
    agentId: index.agentId || agent.id,
    updatedAt: changed ? new Date().toISOString() : index.updatedAt,
    sessions: nextSessions,
  };
  if (changed) {
    writeSessionIndex(agent, nextIndex);
  }
  return nextIndex;
};

export const upsertSessionIndexEntry = (agent: SessionAgent, sessionInfo: SessionInfo) => {
  if (!agent.sessionIndexFile || !sessionInfo?.sessionId || !sessionInfo?.sessionPath) return;
  const index = readSessionIndex(agent);
  const baseDir = agent.sessionRootDir || agent.sessionDir;
  const relPath = relative(baseDir, sessionInfo.sessionPath).replace(/\\/g, "/");
  const nowIso = new Date().toISOString();
  const sessions = Array.isArray(index.sessions) ? [...index.sessions] : [];
  const existingIndex = sessions.findIndex((entry) => entry?.id === sessionInfo.sessionId);
  let sizeBytes = existingIndex >= 0 ? sessions[existingIndex]?.sizeBytes : null;
  try {
    sizeBytes = statSync(sessionInfo.sessionPath).size;
  } catch {
    // ignore
  }
  const nextEntry: SessionIndexEntry = {
    ...(existingIndex >= 0 ? sessions[existingIndex] : {}),
    id: sessionInfo.sessionId,
    label: sessionInfo.label || sessionInfo.sessionId,
    path: relPath,
    createdAt:
      sessionInfo.createdAt || (existingIndex >= 0 ? sessions[existingIndex].createdAt : nowIso),
    updatedAt: nowIso,
    sizeBytes,
  };
  if (existingIndex >= 0) {
    sessions[existingIndex] = nextEntry;
  } else {
    sessions.push(nextEntry);
  }

  writeSessionIndex(agent, {
    version: 1,
    agentId: index.agentId || agent.id,
    updatedAt: nowIso,
    sessions,
  });
};

export const removeSessionIndexEntry = (agent: SessionAgent, sessionId: string) => {
  if (!agent.sessionIndexFile || !sessionId) return;
  const index = readSessionIndex(agent);
  const nextSessions = index.sessions.filter((entry) => entry?.id !== sessionId);
  if (nextSessions.length === index.sessions.length) return;
  const nowIso = new Date().toISOString();
  writeSessionIndex(agent, {
    version: 1,
    agentId: index.agentId || agent.id,
    updatedAt: nowIso,
    sessions: nextSessions,
  });
};

export const extractSessionNameFromFile = (filePath?: string | null) => {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === "session_info" && event.name) {
          return event.name;
        }
      } catch {
        // ignore invalid JSON lines
      }
    }
  } catch {
    // ignore file read errors
  }
  return null;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

export const createSessionPath = (agent: SessionAgent, now = new Date()) => {
  const dateLabel = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timeLabel = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  const sessionId = `${dateLabel}-${timeLabel}-${rand}`;
  const sessionPath = join(agent.sessionDir, `${sessionId}.jsonl`);
  return {
    sessionId,
    sessionPath,
    label: `${dateLabel} ${timeLabel}`,
    createdAt: now.toISOString(),
  };
};

export const relocateSessionFile = (fromPath: string, toPath: string) => {
  if (!fromPath || !toPath) return { ok: false, error: "missing session path" };
  if (!existsSync(fromPath)) {
    return { ok: false, error: "session file not found", missing: true };
  }
  mkdirSync(dirname(toPath), { recursive: true });
  try {
    renameSync(fromPath, toPath);
    return { ok: true, moved: true };
  } catch (err) {
    try {
      copyFileSync(fromPath, toPath);
      try {
        unlinkSync(fromPath);
      } catch {
        // ignore
      }
      return { ok: true, moved: false };
    } catch (copyErr) {
      return { ok: false, error: copyErr instanceof Error ? copyErr.message : String(copyErr) };
    }
  }
};

export const normalizeSessionLabel = (label: string) => {
  if (!label) return "";
  return String(label).replace(/\s+/g, " ").trim();
};

export const normalizeSessionId = (label: string) => {
  const trimmed = normalizeSessionLabel(label).replace(/\.jsonl$/i, "");
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return cleaned.slice(0, 64);
};

export const resolveSessionFilePath = (agent: SessionAgent, sessionPath: string) => {
  if (!agent?.sessionDir || typeof sessionPath !== "string") return null;
  const resolvedPath = resolve(sessionPath);
  const baseDir = resolve(agent.sessionDir);
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${sep}`)) {
    return null;
  }
  if (!resolvedPath.endsWith(".jsonl")) return null;
  return resolvedPath;
};

export const resolveUniqueSessionPath = (
  dirPath: string,
  baseId: string,
  currentPath?: string | null,
) => {
  if (!dirPath) return "";
  const fallback = `session-${Date.now().toString(36)}`;
  const trimmedBase = baseId ? baseId.slice(0, 64) : fallback;
  let candidateId = trimmedBase || fallback;
  let counter = 1;

  while (true) {
    const candidatePath = join(dirPath, `${candidateId}.jsonl`);
    if (currentPath && resolve(candidatePath) === resolve(currentPath)) {
      return candidatePath;
    }
    if (!existsSync(candidatePath)) {
      return candidatePath;
    }
    counter += 1;
    const suffix = `-${counter}`;
    const base = trimmedBase.slice(0, Math.max(1, 64 - suffix.length));
    candidateId = `${base}${suffix}`;
  }
};
