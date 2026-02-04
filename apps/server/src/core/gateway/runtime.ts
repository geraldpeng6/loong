export const createGatewayRuntime = ({
  agents,
  defaultAgentId,
  sessionManager,
  resolveAgentFromText,
  resolveCommand,
  handleGatewayCommand,
  enqueueAgentPrompt,
  abortAgentTask,
  sendAgentRequest,
  sendToAgent,
}) => {
  if (!agents) {
    throw new Error("Gateway runtime requires agents map");
  }

  const getAgent = (id) => agents.get(id);

  return {
    getAgent,
    resolveAgentFromText: (text, currentAgentId) =>
      resolveAgentFromText({
        text,
        currentAgentId,
        agents,
        defaultAgentId,
      }),
    resolveCommand,
    handleGatewayCommand,
    enqueueAgentPrompt,
    abortAgentTask,
    sendAgentRequest,
    getSessionEntries: sessionManager?.getSessionEntries,
    renameSessionFile: sessionManager?.renameSessionFile,
    deleteSessionFile: sessionManager?.deleteSessionFile,
    sendToAgent,
  };
};
