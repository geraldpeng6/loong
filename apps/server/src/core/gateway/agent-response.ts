export const createAgentResponseHandler = ({ onSessionFile } = {}) => {
  return (agent, payload) => {
    if (!payload || payload.type !== "response" || !payload.id) return false;
    const pending = agent.pending.get(payload.id);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      agent.pending.delete(payload.id);
      pending.resolve(payload);
    }

    if (payload.command === "get_state" && payload.success && payload.data?.sessionFile) {
      agent.currentSessionFile = payload.data.sessionFile;
      onSessionFile?.(agent, payload.data.sessionFile, payload);
    }
    return !!pending;
  };
};
