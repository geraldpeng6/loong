type AgentRuntime = { id: string; name?: string; replyPrefixMode?: string };

type DirectReplyContext = {
  source: "imessage" | "web";
  chatId?: string | number | null;
  sender?: string | null;
  ws?: unknown;
};

type DeliverParams = {
  replyText?: string;
  payload?: unknown;
};

type DeliverDependencies = {
  notifyIMessage: (args: {
    text: string;
    chatId?: string | number;
    sender?: string | null;
  }) => Promise<void> | void;
  sendGatewayMessage: (ws: unknown, text: string) => void;
  formatAgentReply: (agent: AgentRuntime, text: string) => string;
  safeNotify: (notify: (text: string) => Promise<void> | void, text: string) => Promise<void>;
  sendIMessageReply: (
    agent: AgentRuntime,
    task: unknown,
    payload?: unknown,
  ) => Promise<void> | void;
  logger?: { error?: (message: string) => void };
};

export const createDirectReplyHandler = ({
  subagentDirectReplies,
  dependencies,
}: {
  subagentDirectReplies: Map<string, DirectReplyContext>;
  dependencies: DeliverDependencies;
}) => {
  const {
    notifyIMessage,
    sendGatewayMessage,
    formatAgentReply,
    safeNotify,
    sendIMessageReply,
    logger = console,
  } = dependencies;

  return async (
    agent: AgentRuntime,
    task: { subagentRunId?: string | null } | null,
    { replyText, payload }: DeliverParams = {},
  ) => {
    const runId = task?.subagentRunId;
    if (!runId) return false;
    const directContext = subagentDirectReplies.get(runId);
    if (!directContext) return false;
    subagentDirectReplies.delete(runId);

    const reply = typeof replyText === "string" ? replyText.trim() : "";
    if (!reply) return false;

    if (directContext.source === "imessage") {
      try {
        if (payload && (payload as { messages?: unknown }).messages) {
          await sendIMessageReply(
            agent,
            { chatId: directContext.chatId, sender: directContext.sender },
            payload,
          );
        } else {
          await safeNotify(
            (text) =>
              notifyIMessage({
                text,
                chatId: directContext.chatId,
                sender: directContext.sender,
              }),
            formatAgentReply(agent, reply),
          );
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error?.(`[loong] direct imessage reply failed: ${message}`);
        return false;
      }
    }

    if (directContext.source === "web" && directContext.ws) {
      sendGatewayMessage(directContext.ws, formatAgentReply(agent, reply));
      return true;
    }

    return false;
  };
};
