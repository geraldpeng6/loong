import { relocateAndSwitchSession } from "./session-relocation.js";

export const createSessionFlow = ({
  sendAgentRequest,
  createSessionPath,
  relocateSessionFile,
  upsertSessionIndexEntry,
  imessagePerChat = false,
  resolveIMessageKey,
  persistIMessageSessionMap,
  logWarn = console.warn,
}) => {
  const buildPromptText = (task) => {
    const text = task.text || "";
    if (task.source === "imessage") {
      if (task.isSlashCommand) return text;
      const sender = task.sender || "unknown";
      const prefix = `iMessage from ${sender}:\n`;
      return `${prefix}${text}`;
    }
    return text;
  };

  const ensureAgentSession = async (agent, task) => {
    if (task.forceNewSession && task.source !== "imessage") {
      await sendAgentRequest(agent, { type: "new_session" });
      const state = await sendAgentRequest(agent, { type: "get_state" });
      const sessionFile = state?.data?.sessionFile ?? null;
      if (sessionFile) {
        agent.currentSessionFile = await relocateAndSwitchSession({
          agent,
          sourceSessionFile: sessionFile,
          createSessionPath,
          relocateSessionFile,
          upsertSessionIndexEntry,
          sendAgentRequest,
          logWarn,
          contextLabel: "force-new-session",
        });
      }
      return agent.currentSessionFile;
    }
    if (task.source !== "imessage" || !imessagePerChat) {
      const state = await sendAgentRequest(agent, { type: "get_state" }).catch(() => null);
      if (state?.data?.sessionFile) {
        agent.currentSessionFile = state.data.sessionFile;
      }
      return agent.currentSessionFile;
    }

    const key = resolveIMessageKey ? resolveIMessageKey(task) : "unknown";
    let sessionFile = agent.imessageSessions.get(key) || null;

    const switchToSession = async () => {
      if (!sessionFile) return false;
      if (agent.currentSessionFile && sessionFile === agent.currentSessionFile) return true;
      const resp = await sendAgentRequest(agent, {
        type: "switch_session",
        sessionPath: sessionFile,
      });
      if (resp?.success === false) {
        agent.imessageSessions.delete(key);
        persistIMessageSessionMap?.(agent);
        sessionFile = null;
        return false;
      }
      agent.currentSessionFile = sessionFile;
      return true;
    };

    if (sessionFile) {
      const ok = await switchToSession();
      if (ok) return sessionFile;
    }

    await sendAgentRequest(agent, { type: "new_session" });
    const state = await sendAgentRequest(agent, { type: "get_state" });
    sessionFile = state?.data?.sessionFile ?? null;
    if (sessionFile) {
      sessionFile = await relocateAndSwitchSession({
        agent,
        sourceSessionFile: sessionFile,
        createSessionPath,
        relocateSessionFile,
        upsertSessionIndexEntry,
        sendAgentRequest,
        logWarn,
        contextLabel: "iMessage session",
      });
      agent.imessageSessions.set(key, sessionFile);
      persistIMessageSessionMap?.(agent);
      await switchToSession();
    }

    return sessionFile;
  };

  return { buildPromptText, ensureAgentSession };
};
