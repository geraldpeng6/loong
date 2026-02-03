import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";

export const createIMessageSessionMap = ({ perChat = false, logger = console } = {}) => {
  const resolveKey = ({ chatId, sender }) => {
    if (chatId != null) return `chat:${chatId}`;
    if (sender) return `sender:${sender}`;
    return "unknown";
  };

  const loadSessionMap = (agent) => {
    if (!perChat) return;
    if (!existsSync(agent.sessionMapFile)) return;
    try {
      const raw = readFileSync(agent.sessionMapFile, "utf8");
      const parsed = JSON.parse(raw);
      const entries = parsed?.entries ?? {};
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value === "string" && value.trim()) {
          agent.imessageSessions.set(key, value.trim());
        }
      }
      if (agent.imessageSessions.size > 0) {
        logger.log?.(
          `[loong] loaded imessage sessions (${agent.id}): ${agent.imessageSessions.size}`,
        );
      }
    } catch (err) {
      logger.error?.(`[loong] failed to load imessage session map: ${err.message}`);
    }
  };

  const persistSessionMap = (agent) => {
    if (!perChat) return;
    try {
      const payload = {
        version: 1,
        entries: Object.fromEntries(agent.imessageSessions.entries()),
      };
      mkdirSync(dirname(agent.sessionMapFile), { recursive: true });
      writeFileSync(agent.sessionMapFile, JSON.stringify(payload, null, 2));
    } catch (err) {
      logger.error?.(`[loong] failed to save imessage session map: ${err.message}`);
    }
  };

  const updateSessionMapping = (agent, sessionKey, sessionFile) => {
    if (!perChat) return;
    if (!sessionKey || !sessionFile) return;
    agent.imessageSessions.set(sessionKey, sessionFile);
    persistSessionMap(agent);
  };

  const replaceSessionPath = (agent, fromPath, toPath) => {
    if (!perChat || !agent?.imessageSessions) return;
    const fromResolved = resolve(fromPath);
    let changed = false;
    for (const [key, value] of agent.imessageSessions.entries()) {
      if (value && resolve(value) === fromResolved) {
        agent.imessageSessions.set(key, toPath);
        changed = true;
      }
    }
    if (changed) {
      persistSessionMap(agent);
    }
  };

  const removeSessionPath = (agent, targetPath) => {
    if (!perChat || !agent?.imessageSessions) return;
    const targetResolved = resolve(targetPath);
    let changed = false;
    for (const [key, value] of agent.imessageSessions.entries()) {
      if (value && resolve(value) === targetResolved) {
        agent.imessageSessions.delete(key);
        changed = true;
      }
    }
    if (changed) {
      persistSessionMap(agent);
    }
  };

  return {
    resolveKey,
    loadSessionMap,
    persistSessionMap,
    updateSessionMapping,
    replaceSessionPath,
    removeSessionPath,
  };
};
