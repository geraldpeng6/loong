import { basename, dirname, resolve } from "path";
import { existsSync, statSync, unlinkSync } from "fs";
import {
  formatSessionSize,
  readSessionIndex,
  writeSessionIndex,
  resolveSessionIndexPath,
  syncSessionIndex,
  upsertSessionIndexEntry,
  removeSessionIndexEntry,
  extractSessionNameFromFile,
  createSessionPath,
  relocateSessionFile,
  normalizeSessionLabel,
  normalizeSessionId,
  resolveSessionFilePath,
  resolveUniqueSessionPath,
} from "./sessions/storage.js";

export const createSessionManager = ({
  sessionCacheTtlMs = 0,
  sendAgentRequest,
  onSessionRenamed,
  onSessionDeleted,
} = {}) => {
  const getSessionEntries = (agent) => {
    const now = Date.now();
    if (
      sessionCacheTtlMs > 0 &&
      agent.sessionCache &&
      now - agent.sessionCache.updatedAt < sessionCacheTtlMs
    ) {
      return agent.sessionCache.entries;
    }

    const index = syncSessionIndex(agent);
    const currentPath = agent.currentSessionFile ? resolve(agent.currentSessionFile) : null;
    const entries = index.sessions.map((entry) => {
      const filePath = resolveSessionIndexPath(agent, entry);
      let sizeText = "unknown";
      if (typeof entry.sizeBytes === "number") {
        sizeText = formatSessionSize(entry.sizeBytes);
      } else if (filePath) {
        try {
          sizeText = formatSessionSize(statSync(filePath).size);
        } catch {
          // ignore
        }
      }
      const autoName = filePath ? extractSessionNameFromFile(filePath) : null;
      const label = autoName || entry.label || entry.id;
      return {
        id: entry.id,
        name: label,
        base: entry.label || entry.id,
        path: filePath,
        sizeText,
        isCurrent: currentPath && filePath && resolve(filePath) === currentPath,
      };
    });

    agent.sessionCache = { entries, updatedAt: now };
    return entries;
  };

  const renameSessionFile = async (agent, sessionPath, label) => {
    const resolvedPath = resolveSessionFilePath(agent, sessionPath);
    if (!resolvedPath) return { ok: false, error: "会话路径无效" };
    if (!existsSync(resolvedPath)) return { ok: false, error: "会话文件不存在" };
    const normalizedLabel = normalizeSessionLabel(label);
    if (!normalizedLabel) return { ok: false, error: "会话名称不能为空" };
    const baseId = normalizeSessionId(normalizedLabel) || `session-${Date.now().toString(36)}`;
    const targetDir = dirname(resolvedPath);
    const targetPath = resolveUniqueSessionPath(targetDir, baseId, resolvedPath);
    if (!targetPath) return { ok: false, error: "会话路径无效" };
    const shouldRename = resolve(targetPath) !== resolve(resolvedPath);

    if (shouldRename) {
      const renameResult = relocateSessionFile(resolvedPath, targetPath);
      if (!renameResult.ok) {
        return { ok: false, error: renameResult.error || "会话重命名失败" };
      }
    }

    const oldId = basename(resolvedPath).replace(/\.jsonl$/, "");
    const nextId = basename(targetPath).replace(/\.jsonl$/, "");
    const index = readSessionIndex(agent);
    const prevEntry = index.sessions.find((entry) => entry?.id === oldId) || null;
    const createdAt = prevEntry?.createdAt || null;

    if (oldId && oldId !== nextId) {
      removeSessionIndexEntry(agent, oldId);
    }
    upsertSessionIndexEntry(agent, {
      sessionId: nextId,
      sessionPath: targetPath,
      label: normalizedLabel,
      createdAt,
    });

    agent.sessionCache = null;

    if (agent.currentSessionFile && resolve(agent.currentSessionFile) === resolve(resolvedPath)) {
      agent.currentSessionFile = targetPath;
      if (sendAgentRequest) {
        try {
          await sendAgentRequest(agent, { type: "switch_session", sessionPath: targetPath });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[loong] failed to switch renamed session: ${message}`);
        }
      }
    }

    if (shouldRename && onSessionRenamed) {
      onSessionRenamed(agent, resolvedPath, targetPath);
    }

    return {
      ok: true,
      sessionPath: targetPath,
      sessionId: nextId,
      label: normalizedLabel,
      renamed: shouldRename,
    };
  };

  const deleteSessionFile = (agent, sessionPath) => {
    const resolvedPath = resolveSessionFilePath(agent, sessionPath);
    if (!resolvedPath) return { ok: false, error: "会话路径无效" };
    if (!existsSync(resolvedPath)) return { ok: false, error: "会话文件不存在" };
    if (agent.currentSessionFile && resolve(agent.currentSessionFile) === resolve(resolvedPath)) {
      return { ok: false, error: "当前会话正在使用，请先切换后删除" };
    }
    try {
      unlinkSync(resolvedPath);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const sessionId = basename(resolvedPath).replace(/\.jsonl$/, "");
    removeSessionIndexEntry(agent, sessionId);
    agent.sessionCache = null;
    if (onSessionDeleted) {
      onSessionDeleted(agent, resolvedPath);
    }
    return { ok: true, sessionPath: resolvedPath, sessionId };
  };

  return {
    getSessionEntries,
    createSessionPath,
    relocateSessionFile,
    renameSessionFile,
    deleteSessionFile,
    readSessionIndex,
    writeSessionIndex,
    resolveSessionIndexPath,
    syncSessionIndex,
    upsertSessionIndexEntry,
    removeSessionIndexEntry,
    normalizeSessionLabel,
    normalizeSessionId,
    resolveSessionFilePath,
    resolveUniqueSessionPath,
  };
};
