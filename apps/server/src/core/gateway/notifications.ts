type AgentRuntime = { id: string; name?: string; replyPrefixMode?: string };

type Task = {
  source?: string;
  ws?: unknown;
  chatId?: string | number | null;
  sender?: string | null;
};

type Logger = {
  error?: (message: string) => void;
};

type NotifyIMessage = (args: {
  text: string;
  chatId?: string | number;
  sender?: string | null;
}) => Promise<void> | void;

type SendGatewayMessage = (ws: unknown, text: string) => void;

export const createNotificationHelpers = ({
  notifyIMessage,
  sendGatewayMessage,
  notifyBackground,
  logger = console,
}: {
  notifyIMessage: NotifyIMessage;
  sendGatewayMessage: SendGatewayMessage;
  notifyBackground?: (agentId: string, text: string) => void;
  logger?: Logger;
}) => {
  const resolveAgentLabel = (agent: AgentRuntime) => `[${agent.name || agent.id}]`;

  const formatAgentReply = (agent: AgentRuntime, text: string) => {
    if (!text) return text;
    if (agent.replyPrefixMode === "never") return text;
    return `${resolveAgentLabel(agent)} ${text}`.trim();
  };

  const safeNotify = async (notify: (text: string) => Promise<void> | void, text: string) => {
    try {
      await notify(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error?.(`[loong] notify failed: ${message}`);
    }
  };

  const notifyTaskMessage = async (agent: AgentRuntime, task: Task, text: string) => {
    if (!task || !text) return;
    const message = formatAgentReply(agent, text);
    if (task.source === "imessage") {
      await safeNotify(
        (replyText) =>
          notifyIMessage({ text: replyText, chatId: task.chatId, sender: task.sender }),
        message,
      );
      return;
    }
    if (task.source === "web" && task.ws) {
      sendGatewayMessage(task.ws, message);
    }
  };

  const notifyBackgroundWebClients = (agent: AgentRuntime, reply: string) => {
    const text = formatAgentReply(agent, reply);
    if (!notifyBackground) return;
    notifyBackground(agent.id, text);
  };

  return {
    resolveAgentLabel,
    formatAgentReply,
    safeNotify,
    notifyTaskMessage,
    notifyBackgroundWebClients,
  };
};
