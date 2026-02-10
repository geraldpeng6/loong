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
  const extractAssistantErrorText = (message) => {
    if (!message || message.role !== "assistant") return "";
    if (message.stopReason !== "error") return "";
    const raw = typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
    if (!raw) return "处理失败：模型返回错误。";
    try {
      const parsed = JSON.parse(raw);
      const code = parsed?.detail?.code;
      if (typeof code === "string" && code.trim()) {
        return `处理失败：${code}`;
      }
      const detailMessage = parsed?.detail?.message;
      if (typeof detailMessage === "string" && detailMessage.trim()) {
        return `处理失败：${detailMessage.trim()}`;
      }
    } catch {
      // Keep raw text as fallback when errorMessage is not JSON.
    }
    return `处理失败：${raw}`;
  };

  const triggerTaskStart = (task) => {
    if (!task) return;
    if (!task.onStart) return;
    const onStart = task.onStart;
    task.onStart = undefined;
    void Promise.resolve(onStart()).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[loong] task ${task.id} onStart failed: ${message}`);
    });
  };

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

    if (payload.type === "message") {
      const task = agent.currentTask;
      const message = payload.message;
      if (task && message?.role === "assistant") {
        triggerTaskStart(task);
      }
      return;
    }

    if (payload.type === "turn_end") {
      const task = agent.currentTask;
      if (!task || task.aborted || !task.onReply || task.replySent) return;
      triggerTaskStart(task);
      const message = payload.message;
      if (!message || message.role !== "assistant") return;
      if (message.stopReason === "toolUse") return;
      const reply = (extractTextBlocks?.(message.content) ?? "").trim();
      const errorReply = extractAssistantErrorText(message);
      const finalReply = reply || errorReply;
      void deliverSubagentDirectReply?.(agent, task, { replyText: finalReply });
      if (resolveTaskReply?.(task, finalReply)) {
        completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
      }
      return;
    }

    if (payload.type === "agent_end") {
      const task = agent.currentTask;
      triggerTaskStart(task);
      clearTaskTimeout?.(task);
      clearSlashCommandTimer?.(task);
      if (task?.aborted) {
        completeCurrentTask?.(agent, task, { skipQueue: agent.offline });
        return;
      }
      const messages = payload.messages || [];
      const reply = (extractAssistantText?.(messages) ?? "").trim();
      const assistantMessages = Array.isArray(messages)
        ? messages.filter((m) => m?.role === "assistant")
        : [];
      const latestAssistant = assistantMessages[assistantMessages.length - 1] || null;
      const errorReply = extractAssistantErrorText(latestAssistant);
      const finalReply = reply || errorReply;

      void deliverSubagentDirectReply?.(agent, task, { replyText: finalReply, payload });

      resolveTaskReply?.(task, finalReply);

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
