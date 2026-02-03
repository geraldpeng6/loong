export const createAgentRequest = ({ sendToAgent }) => {
  if (!sendToAgent) {
    throw new Error("createAgentRequest requires sendToAgent");
  }

  return (agent, command, { timeoutMs = 10000 } = {}) => {
    if (agent.offline) {
      return Promise.reject(new Error(`agent ${agent.id} offline`));
    }
    const id = `${agent.id}-${++agent.requestId}`;
    const payload = { ...command, id };
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            agent.pending.delete(id);
            reject(new Error(`pi RPC timeout (${command.type})`));
          }, timeoutMs)
        : undefined;
      agent.pending.set(id, { resolve, reject, timer });
      sendToAgent(agent, payload);
    });
  };
};
