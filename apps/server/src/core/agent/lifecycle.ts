type AgentRuntime = {
  id: string;
  offline?: boolean;
  restartTimer?: NodeJS.Timeout | null;
  pending?: Map<string, { reject: (err: Error) => void; timer?: NodeJS.Timeout | null }>;
  queue?: unknown[];
  currentTask?: unknown;
  busy?: boolean;
  currentSessionFile?: string | null;
};

export const createAgentLifecycle = ({
  agentRestartMs,
  spawnAgentProcess,
  failCurrentTask,
  broadcastAgentStatus,
}: {
  agentRestartMs: number;
  spawnAgentProcess: (agent: AgentRuntime) => void;
  failCurrentTask: (
    agent: AgentRuntime,
    task: unknown,
    message: string,
    options?: unknown,
  ) => Promise<void>;
  broadcastAgentStatus: (agent: AgentRuntime) => void;
}) => {
  const rejectPendingRequests = (agent: AgentRuntime, reason: string) => {
    if (!agent.pending) return;
    for (const pending of agent.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    agent.pending.clear();
  };

  const scheduleAgentRestart = (agent: AgentRuntime) => {
    if (agentRestartMs < 0) return;
    if (agent.restartTimer) return;
    const delay = Math.max(0, agentRestartMs);
    agent.restartTimer = setTimeout(() => {
      agent.restartTimer = null;
      spawnAgentProcess(agent);
    }, delay);
  };

  const handleAgentExit = async (agent: AgentRuntime, reason: string) => {
    if (agent.offline && agent.restartTimer) return;
    agent.offline = true;
    rejectPendingRequests(agent, reason);
    agent.queue = [];
    if (agent.currentTask) {
      await failCurrentTask(agent, agent.currentTask, "代理已退出，任务已取消。", {
        skipQueue: true,
      });
      scheduleAgentRestart(agent);
      return;
    }
    agent.busy = false;
    agent.currentTask = null;
    broadcastAgentStatus(agent);
    scheduleAgentRestart(agent);
  };

  return { handleAgentExit };
};
