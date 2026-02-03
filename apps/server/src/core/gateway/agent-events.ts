export const createAgentEventHandler = ({
  handleExtensionUiRequest,
  clearSlashCommandTimer,
  clearTaskTimeout,
  resolveTaskReply,
  completeCurrentTask,
  deliverSubagentDirectReply,
  extractTextBlocks,
  extractAssistantText,
  sendIMessageReply,
  notifyBackgroundWebClients,
}) => {
  return (agent, payload) => {
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "extension_ui_request") {
      void handleExtensionUiRequest?.(agent, payload);
      return;
    }

    if (payload.type === "agent_start") {
      const task = agent.currentTask;
      if (task) {
        task.agentStarted = true;
        clearSlashCommandTimer?.(task);
      }
      return;
    }

    if (payload.type === "turn_end") {
      const task = agent.currentTask;
      if (!task || task.aborted || !task.onReply || task.replySent) return;
      const message = payload.message;
      if (!message || message.role !== "assistant") return;
      if (message.stopReason === "toolUse") return;
      const reply = extractTextBlocks?.(message.content) ?? "";
      void deliverSubagentDirectReply?.(agent, task, { replyText: reply });
      if (resolveTaskReply?.(task, reply)) {
        completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
      }
      return;
    }

    if (payload.type === "agent_end") {
      const task = agent.currentTask;
      clearTaskTimeout?.(task);
      clearSlashCommandTimer?.(task);
      if (task?.aborted) {
        completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
        return;
      }
      const reply = extractAssistantText?.(payload.messages || []) ?? "";

      void deliverSubagentDirectReply?.(agent, task, { replyText: reply, payload });

      resolveTaskReply?.(task, reply);

      if (task?.source === "imessage") {
        (async () => {
          try {
            await sendIMessageReply?.(agent, task, payload);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[loong] imessage send failed: ${message}`);
          } finally {
            completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
          }
        })();
      } else {
        completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
      }

      if (reply?.trim()) {
        notifyBackgroundWebClients?.(agent, reply);
      }
    }
  };
};
