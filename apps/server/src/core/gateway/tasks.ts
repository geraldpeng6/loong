export const createTaskRunner = ({
  taskTimeoutMs = 0,
  slashCommandTimeoutMs = 0,
  createTaskId,
  isSlashCommandText,
  sendAgentRequest,
  sendToAgent,
  ensureAgentSession,
  buildPromptText,
  notifyTaskMessage,
  broadcastAgentStatus,
  subagentRuns,
  persistSubagentRuns,
}) => {
  const clearTaskTimeout = (task) => {
    if (task?.timeoutTimer) {
      clearTimeout(task.timeoutTimer);
      task.timeoutTimer = null;
    }
  };

  const clearSlashCommandTimer = (task) => {
    if (task?.slashCommandTimer) {
      clearTimeout(task.slashCommandTimer);
      task.slashCommandTimer = null;
    }
  };

  const completeCurrentTask = (agent, task, { skipQueue = false } = {}) => {
    if (!task) return;
    clearTaskTimeout(task);
    clearSlashCommandTimer(task);
    agent.busy = false;
    agent.currentTask = null;
    if (!skipQueue) {
      processNextAgent(agent);
    }
    broadcastAgentStatus?.(agent);
  };

  const failCurrentTask = async (agent, task, text, { skipQueue = false } = {}) => {
    if (!task) return;
    task.aborted = true;
    clearTaskTimeout(task);
    clearSlashCommandTimer(task);
    if (notifyTaskMessage) {
      await notifyTaskMessage(agent, task, text);
    }
    agent.busy = false;
    agent.currentTask = null;
    if (!skipQueue) {
      processNextAgent(agent);
    }
    broadcastAgentStatus?.(agent);
  };

  const enqueueAgentPrompt = (agent, task) => {
    if (agent.offline) {
      void notifyTaskMessage?.(agent, task, "代理当前不可用，请稍后再试。");
      return;
    }
    if (!task.id) {
      task.id = createTaskId
        ? createTaskId()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!Number.isFinite(task.subagentDepth)) {
      task.subagentDepth = 0;
    }
    if (typeof task.text === "string" && isSlashCommandText) {
      task.isSlashCommand = isSlashCommandText(task.text);
    }
    agent.queue.push(task);
    processNextAgent(agent);
    broadcastAgentStatus?.(agent);
  };

  const processNextAgent = async (agent) => {
    if (agent.offline) return;
    if (agent.busy || agent.queue.length === 0) return;
    agent.busy = true;
    agent.currentTask = agent.queue.shift();

    const task = agent.currentTask;
    if (taskTimeoutMs > 0) {
      task.timeoutTimer = setTimeout(() => {
        void failCurrentTask(agent, task, "处理超时，已取消。", { skipQueue: agent.offline });
      }, taskTimeoutMs);
    }
    if (task.isSlashCommand && slashCommandTimeoutMs > 0) {
      task.slashCommandTimer = setTimeout(() => {
        if (!task.agentStarted) {
          completeCurrentTask(agent, task, { skipQueue: agent.offline });
        }
      }, slashCommandTimeoutMs);
    }

    try {
      const sessionFile = await ensureAgentSession?.(agent, task);
      if (task.subagentRunId && subagentRuns) {
        const run = subagentRuns.get(task.subagentRunId);
        if (run) {
          run.sessionFile = sessionFile || agent.currentSessionFile || null;
          run.updatedAt = new Date().toISOString();
          subagentRuns.set(task.subagentRunId, run);
          persistSubagentRuns?.();
        }
      }
      const snapshot = await sendAgentRequest?.(agent, { type: "get_messages" }).catch(() => null);
      task.baseMessageCount = snapshot?.data?.messages?.length ?? null;
      const message = buildPromptText?.(task) ?? task.text ?? "";
      if (task.onStart) {
        try {
          await task.onStart();
        } catch (err) {
          const startMessage = err instanceof Error ? err.message : String(err);
          console.error(`[loong] task ${task.id} onStart failed: ${startMessage}`);
        }
      }
      sendToAgent?.(agent, { type: "prompt", message });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[loong] agent ${agent.id} session error: ${message}`);
      await failCurrentTask(agent, task, `启动失败：${message}`, {
        skipQueue: agent.offline,
      });
      return;
    } finally {
      broadcastAgentStatus?.(agent);
    }
  };

  return {
    enqueueAgentPrompt,
    processNextAgent,
    completeCurrentTask,
    failCurrentTask,
    clearTaskTimeout,
    clearSlashCommandTimer,
  };
};
