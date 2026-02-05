import type { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { AttachmentReference, FileStorageService } from "../../core/files/types.js";

type AgentRuntime = {
  id: string;
  name?: string;
  keywords?: string[];
  busy?: boolean;
  queue?: Array<unknown>;
  sessionCache?: unknown;
  currentSessionFile?: string | null;
};

type GatewayCommand = { type: string; remainder: string };

type GatewayRuntime = {
  getAgent?: (id: string) => AgentRuntime | null;
  resolveAgentFromText?: (
    text: string,
    currentAgentId?: string | null,
  ) => { agent: AgentRuntime | null; remainder: string; switched: boolean };
  resolveCommand?: (text: string) => GatewayCommand | null;
  handleGatewayCommand?: (params: {
    agent: AgentRuntime;
    command: GatewayCommand;
    respond: (text: string) => void;
    sendPrompt: (text: string) => void;
    contextKey: string | null;
    source?: string;
    requester?: string;
  }) => Promise<boolean>;
  enqueueAgentPrompt?: (
    agent: AgentRuntime,
    task: {
      source: string;
      ws?: WebSocket;
      text: string;
      attachments?: AttachmentReference[];
    },
  ) => void;
  abortAgentTask?: (agent: AgentRuntime) => boolean | Promise<boolean>;
  sendAgentRequest?: (agent: AgentRuntime, payload: Record<string, unknown>) => Promise<unknown>;
  getSessionEntries?: (agent: AgentRuntime) => unknown[];
  renameSessionFile?: (
    agent: AgentRuntime,
    sessionPath: string,
    label: string,
  ) => Promise<
    | {
        ok: true;
        sessionPath: string;
        sessionId: string;
        label: string;
        renamed: boolean;
      }
    | { ok: false; error: string }
  >;
  deleteSessionFile?: (
    agent: AgentRuntime,
    sessionPath: string,
  ) => { ok: true; sessionPath: string; sessionId: string } | { ok: false; error: string };
  sendToAgent?: (agent: AgentRuntime, payload: Record<string, unknown>) => void;
};

type ClientContext = { agentId: string | null };

const normalizeContext = (context: ClientContext | undefined, fallbackAgentId: string | null) => {
  if (!context || !context.agentId) return { agentId: fallbackAgentId };
  return context;
};

const sendToClient = (
  client: WebSocket,
  payload: unknown,
  { raw = false }: { raw?: boolean } = {},
) => {
  if (!client || client.readyState !== WebSocket.OPEN) return false;
  client.send(raw ? (payload as string) : JSON.stringify(payload));
  return true;
};

export interface CreateWebChannelOptions {
  server: Server;
  path?: string;
  passwordRequired?: boolean;
  isAuthorizedRequest?: (req: IncomingMessage) => boolean;
  wsHeartbeatMs?: number;
  agentList?: AgentRuntime[];
  defaultAgentId?: string | null;
  loongState?: string;
  loongWorkspaces?: string;
  loongSessions?: string;
  loongRuntime?: string;
  gateway?: GatewayRuntime;
  fileStorage?: FileStorageService | null;
  publicBaseUrl?: string;
}

export const createWebChannel = ({
  server,
  path = "/ws",
  passwordRequired = false,
  isAuthorizedRequest,
  wsHeartbeatMs = 30000,
  agentList = [],
  defaultAgentId = null,
  loongState,
  loongWorkspaces,
  loongSessions,
  loongRuntime,
  gateway = {},
  fileStorage = null,
  publicBaseUrl = "",
}: CreateWebChannelOptions) => {
  const {
    getAgent,
    resolveAgentFromText,
    resolveCommand,
    handleGatewayCommand,
    enqueueAgentPrompt,
    abortAgentTask,
    sendAgentRequest,
    getSessionEntries,
    renameSessionFile,
    deleteSessionFile,
    sendToAgent,
  } = gateway;
  const clients = new Set<WebSocket>();
  const contexts = new Map<WebSocket, ClientContext>();

  const broadcastToAgent = (agentId, payload, { raw = false } = {}) => {
    let sent = 0;
    for (const client of clients) {
      const context = contexts.get(client);
      if (context?.agentId !== agentId) continue;
      if (sendToClient(client, payload, { raw })) sent += 1;
    }
    return sent;
  };

  const broadcastExceptAgent = (agentId, payload) => {
    let sent = 0;
    for (const client of clients) {
      const context = contexts.get(client);
      if (context?.agentId === agentId) continue;
      if (sendToClient(client, payload)) sent += 1;
    }
    return sent;
  };

  const sendGatewayMessage = (ws, text) => {
    sendToClient(ws, { type: "gateway_message", text });
  };

  const broadcastGatewayMessage = ({ scope = "all", agentId = null, text }) => {
    const payload = { type: "gateway_message", text };
    if (scope === "agent") {
      if (!agentId) return 0;
      return broadcastToAgent(agentId, payload);
    }
    return broadcastToAgent(agentId, payload) + broadcastExceptAgent(agentId, payload);
  };

  const broadcastAgentStatus = (agent) => {
    if (!agent) return;
    broadcastToAgent(agent.id, {
      type: "gateway_agent_status",
      agent: { id: agent.id, name: agent.name },
      busy: agent.busy,
      queueLength: agent.queue.length,
    });
  };

  const notifyBackground = ({ agentId, text }) => {
    if (!agentId) return 0;
    return broadcastExceptAgent(agentId, { type: "gateway_message", text });
  };

  const broadcastAgentPayload = (agentId, line) => {
    if (!agentId || !line) return 0;
    return broadcastToAgent(agentId, line, { raw: true });
  };

  const wss = new WebSocketServer({ server, path });

  wss.on("connection", (ws, req) => {
    if (passwordRequired && (!req || !isAuthorizedRequest?.(req))) {
      ws.close(1008, "Unauthorized");
      return;
    }
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    clients.add(ws);
    contexts.set(ws, { agentId: defaultAgentId });
    sendToClient(ws, {
      type: "gateway_ready",
      agents: agentList,
      defaultAgent: defaultAgentId,
      activeAgent: defaultAgentId,
      loongState,
      loongWorkspaces,
      loongSessions,
      loongRuntime,
    });

    ws.on("message", async (data) => {
      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        sendToClient(ws, { type: "error", error: "Invalid JSON" });
        return;
      }

      if (!payload || typeof payload !== "object" || !payload.type) {
        sendToClient(ws, { type: "error", error: "Missing 'type' in message" });
        return;
      }

      if (payload.type === "list_agents") {
        sendToClient(ws, {
          type: "response",
          id: payload.id,
          command: "list_agents",
          success: true,
          data: { agents: agentList, defaultAgent: defaultAgentId },
        });
        return;
      }

      if (payload.type === "switch_agent") {
        const targetId = typeof payload.agentId === "string" ? payload.agentId : "";
        const agent = getAgent?.(targetId);
        if (!agent) {
          sendToClient(ws, { type: "error", error: "Agent not found" });
          return;
        }
        contexts.set(ws, { agentId: agent.id });
        sendToClient(ws, {
          type: "gateway_agent_switched",
          agent: { id: agent.id, name: agent.name, keywords: agent.keywords },
        });
        return;
      }

      const context = normalizeContext(contexts.get(ws), defaultAgentId);
      const currentAgent = getAgent?.(context.agentId) || getAgent?.(defaultAgentId);
      if (!currentAgent) {
        sendToClient(ws, { type: "error", error: "No agent available" });
        return;
      }

      if (payload.type === "abort") {
        const aborted = (await abortAgentTask?.(currentAgent)) ?? false;
        if (payload.id) {
          sendToClient(ws, {
            type: "response",
            id: payload.id,
            command: "abort",
            success: aborted,
          });
        }
        return;
      }

      if (payload.type === "list_sessions") {
        await sendAgentRequest?.(currentAgent, { type: "get_state" }).catch(() => null);
        if (payload.force) {
          currentAgent.sessionCache = null;
        }
        const entries = getSessionEntries?.(currentAgent) || [];
        sendToClient(ws, {
          type: "response",
          id: payload.id,
          command: "list_sessions",
          success: true,
          data: { sessions: entries },
        });
        return;
      }

      if (payload.type === "rename_session") {
        await sendAgentRequest?.(currentAgent, { type: "get_state" }).catch(() => null);
        const sessionPath = typeof payload.sessionPath === "string" ? payload.sessionPath : "";
        const label = typeof payload.label === "string" ? payload.label : "";
        const result = await renameSessionFile?.(currentAgent, sessionPath, label);
        sendToClient(ws, {
          type: "response",
          id: payload.id,
          command: "rename_session",
          success: result?.ok,
          data: result?.ok
            ? {
                sessionPath: result.sessionPath,
                sessionId: result.sessionId,
                label: result.label,
                renamed: result.renamed,
              }
            : null,
          error: result?.ok ? null : result?.error,
        });
        return;
      }

      if (payload.type === "delete_session") {
        await sendAgentRequest?.(currentAgent, { type: "get_state" }).catch(() => null);
        const sessionPath = typeof payload.sessionPath === "string" ? payload.sessionPath : "";
        const result = deleteSessionFile?.(currentAgent, sessionPath);
        sendToClient(ws, {
          type: "response",
          id: payload.id,
          command: "delete_session",
          success: result?.ok,
          data: result?.ok
            ? {
                sessionPath: result.sessionPath,
                sessionId: result.sessionId,
              }
            : null,
          error: result?.ok ? null : result?.error,
        });
        return;
      }

      // Handle prompt with attachments (new format)
      if (payload.type === "prompt_with_attachments" && typeof payload.message === "string") {
        const resolved = resolveAgentFromText
          ? resolveAgentFromText(payload.message, context.agentId)
          : { agent: currentAgent, remainder: payload.message, switched: false };
        const { agent, remainder, switched } = resolved;

        if (!agent) {
          sendToClient(ws, { type: "error", error: "No agent available" });
          return;
        }

        if (switched) {
          contexts.set(ws, { agentId: agent.id });
          sendToClient(ws, {
            type: "gateway_agent_switched",
            agent: { id: agent.id, name: agent.name, keywords: agent.keywords },
          });
        }

        const trimmed = remainder.trim();
        if (!trimmed && (!Array.isArray(payload.attachments) || payload.attachments.length === 0)) {
          sendGatewayMessage(ws, `已切换到 ${agent.name}`);
          return;
        }

        // Validate attachments
        const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        const validatedAttachments = [];
        for (const att of attachments) {
          if (att?.fileId) {
            // Verify file exists
            const metadata = fileStorage ? await fileStorage.getMetadata(att.fileId) : null;
            if (metadata) {
              validatedAttachments.push({
                fileId: att.fileId,
                fileName: att.fileName || metadata.fileName,
                mimeType: att.mimeType || metadata.mimeType,
                size: metadata.size,
                url: `${publicBaseUrl}/api/files/${att.fileId}`,
              });
            }
          }
        }

        const command = resolveCommand?.(trimmed);
        const handled = command
          ? await handleGatewayCommand?.({
              agent,
              command,
              respond: (replyText) => sendGatewayMessage(ws, replyText),
              sendPrompt: (promptText) =>
                enqueueAgentPrompt?.(agent, {
                  source: "web",
                  ws,
                  text: promptText,
                  attachments: validatedAttachments,
                }),
              contextKey: null,
              source: "web",
            })
          : false;
        if (handled) {
          return;
        }

        enqueueAgentPrompt?.(agent, {
          source: "web",
          ws,
          text: trimmed,
          attachments: validatedAttachments,
        });
        return;
      }

      // Handle plain text prompt (backward compatible)
      if (payload.type === "prompt" && typeof payload.message === "string") {
        const resolved = resolveAgentFromText
          ? resolveAgentFromText(payload.message, context.agentId)
          : { agent: currentAgent, remainder: payload.message, switched: false };
        const { agent, remainder, switched } = resolved;

        if (!agent) {
          sendToClient(ws, { type: "error", error: "No agent available" });
          return;
        }

        if (switched) {
          contexts.set(ws, { agentId: agent.id });
          sendToClient(ws, {
            type: "gateway_agent_switched",
            agent: { id: agent.id, name: agent.name, keywords: agent.keywords },
          });
        }

        const trimmed = remainder.trim();
        if (!trimmed) {
          sendGatewayMessage(ws, `已切换到 ${agent.name}`);
          return;
        }

        const command = resolveCommand?.(trimmed);
        const handled = command
          ? await handleGatewayCommand?.({
              agent,
              command,
              respond: (replyText) => sendGatewayMessage(ws, replyText),
              sendPrompt: (promptText) =>
                enqueueAgentPrompt?.(agent, {
                  source: "web",
                  ws,
                  text: promptText,
                }),
              contextKey: null,
              source: "web",
            })
          : false;
        if (handled) {
          return;
        }

        enqueueAgentPrompt?.(agent, {
          source: "web",
          ws,
          text: trimmed,
        });
        return;
      }

      sendToAgent?.(currentAgent, payload);
    });

    ws.on("close", () => {
      clients.delete(ws);
      contexts.delete(ws);
    });
  });

  const heartbeatInterval =
    wsHeartbeatMs > 0
      ? setInterval(() => {
          for (const client of wss.clients) {
            if (client.isAlive === false) {
              client.terminate();
              continue;
            }
            client.isAlive = false;
            client.ping();
          }
        }, wsHeartbeatMs)
      : null;

  wss.on("close", () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  });

  return {
    sendGatewayMessage,
    broadcastGatewayMessage,
    broadcastAgentStatus,
    notifyBackground,
    broadcastAgentPayload,
    sendToAgentClients: (agentId, payload) => broadcastToAgent(agentId, payload),
  };
};
