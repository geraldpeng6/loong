type AgentRuntime = {
  id: string;
  pi?: { kill?: () => void } | null;
  offline?: boolean;
};

type Logger = {
  warn?: (message: string) => void;
};

export const restartAgentProcesses = ({
  agents,
  logger = console,
}: {
  agents: Map<string, AgentRuntime>;
  logger?: Logger;
}) => {
  for (const agent of agents.values()) {
    if (agent.pi && !agent.offline) {
      try {
        agent.pi.kill?.();
      } catch (err) {
        logger.warn?.(`[loong] failed to restart agent ${agent.id}: ${err.message}`);
      }
    }
  }
};
