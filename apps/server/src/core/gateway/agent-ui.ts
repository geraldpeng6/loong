type AgentRuntime = {
  id: string;
  name?: string;
  replyPrefixMode?: string;
  currentTask?: TaskContext | null;
  offline?: boolean;
};

type TaskContext = {
  source?: string;
  ws?: unknown;
  chatId?: string | number | null;
  sender?: string | null;
  isSlashCommand?: boolean;
  agentStarted?: boolean;
};

type ExtensionPayload = {
  method?: string;
  message?: string;
};

export const createAgentUiHandlers = ({
  formatAgentReply,
  notifyIMessage,
  safeNotify,
  sendGatewayMessage,
  broadcastGatewayMessage,
  completeCurrentTask,
}: {
  formatAgentReply: (agent: AgentRuntime, text: string) => string;
  notifyIMessage: (args: {
    text: string;
    chatId?: string | number;
    sender?: string | null;
  }) => Promise<void> | void;
  safeNotify: (notify: (text: string) => Promise<void> | void, text: string) => Promise<void>;
  sendGatewayMessage: (ws: unknown, text: string) => void;
  broadcastGatewayMessage: (payload: {
    scope?: string;
    agentId?: string | null;
    text: string;
  }) => void;
  completeCurrentTask: (agent: AgentRuntime, task: TaskContext, options?: unknown) => void;
}) => {
  const handleExtensionUiRequest = async (agent: AgentRuntime, payload: ExtensionPayload) => {
    if (!payload || payload.method !== "notify") return;
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (!message) return;

    const formatted = formatAgentReply(agent, message);
    const task = agent.currentTask;

    if (task?.source === "imessage") {
      await safeNotify(
        (text) => notifyIMessage({ text, chatId: task.chatId, sender: task.sender }),
        formatted,
      );
      if (task.isSlashCommand && !task.agentStarted) {
        completeCurrentTask(agent, task, { skipQueue: agent.offline });
      }
      return;
    }

    if (task?.source === "web" && task.ws) {
      sendGatewayMessage(task.ws, formatted);
      if (task.isSlashCommand && !task.agentStarted) {
        completeCurrentTask(agent, task, { skipQueue: agent.offline });
      }
      return;
    }

    broadcastGatewayMessage({
      scope: "agent",
      agentId: agent.id,
      text: formatted,
    });
  };

  const createGatewaySender = (webChannel?: {
    sendGatewayMessage: (ws: unknown, text: string) => void;
    broadcastAgentStatus: (agent: AgentRuntime) => void;
  }) => {
    const sendGatewayMessageAdapter = (ws: unknown, text: string) => {
      if (webChannel) {
        webChannel.sendGatewayMessage(ws, text);
        return;
      }
      const socket = ws as { readyState?: number; send?: (data: string) => void } | null;
      if (socket?.readyState === 1 && socket.send) {
        socket.send(JSON.stringify({ type: "gateway_message", text }));
      }
    };

    const broadcastAgentStatus = (agent: AgentRuntime) => {
      if (!webChannel) return;
      webChannel.broadcastAgentStatus(agent);
    };

    return { sendGatewayMessage: sendGatewayMessageAdapter, broadcastAgentStatus };
  };

  return { handleExtensionUiRequest, createGatewaySender };
};
