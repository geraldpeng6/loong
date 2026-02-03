import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AvailableModel,
  ForkMessage,
  GatewayAgent,
  GatewayMessage,
  ModelState,
  SessionEntry,
} from "@/types/gateway";
import type { AttachmentReference } from "@/types/upload";
import { appendAuthQuery } from "@/lib/auth";

export type GatewayStatus = "connecting" | "connected" | "disconnected";

export type GatewayState = {
  status: GatewayStatus;
  agents: GatewayAgent[];
  currentAgentId: string | null;
  currentAgentName: string | null;
  busy: boolean;
  queueLength: number;
  sessions: SessionEntry[];
  sessionFile: string | null;
  model: ModelState | null;
  availableModels: AvailableModel[];
  messages: GatewayMessage[];
  forkMessages: ForkMessage[];
  streamingAssistant: string | null;
  draft: string;
};

const initialState: GatewayState = {
  status: "connecting",
  agents: [],
  currentAgentId: null,
  currentAgentName: null,
  busy: false,
  queueLength: 0,
  sessions: [],
  sessionFile: null,
  model: null,
  availableModels: [],
  messages: [],
  forkMessages: [],
  streamingAssistant: null,
  draft: "",
};

const extractText = (content: GatewayMessage["content"]) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block) return "";
        if (block.type === "text" || block.type === "input_text") {
          return block.text || "";
        }
        return "";
      })
      .join("");
  }
  return "";
};

export const useGateway = () => {
  const [state, setState] = useState<GatewayState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const localPromptQueue = useRef<string[]>([]);
  const currentAgentIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const connectionIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, string>());

  const send = useCallback((payload: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const sendRequest = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const id = `web-${Date.now()}-${++requestIdRef.current}`;
    pendingRequestsRef.current.set(id, type);
    wsRef.current.send(JSON.stringify({ type, id, ...payload }));
  }, []);

  const refreshSessionState = useCallback(() => {
    sendRequest("get_messages");
    sendRequest("get_state");
    sendRequest("list_sessions");
  }, [sendRequest]);

  const refreshSessions = useCallback(() => {
    sendRequest("list_sessions");
  }, [sendRequest]);

  const sendPrompt = useCallback(
    (text: string, attachments?: AttachmentReference[]) => {
      if (!text.trim() && (!attachments || attachments.length === 0)) return;
      localPromptQueue.current.push(text);

      const hasAttachments = attachments && attachments.length > 0;

      setState((prev) => ({
        ...prev,
        draft: "",
        messages: [
          ...prev.messages,
          {
            role: hasAttachments ? "user-with-attachments" : "user",
            content: [{ type: "text", text }],
            timestamp: Date.now(),
            attachments: hasAttachments
              ? attachments.map((att) => ({
                  mimeType: att.mimeType,
                  fileName: att.fileName,
                  url: att.url,
                }))
              : undefined,
          },
        ],
      }));

      if (hasAttachments) {
        send({
          type: "prompt_with_attachments",
          message: text,
          attachments: attachments.map((att) => ({
            fileId: att.fileId,
            fileName: att.fileName,
            mimeType: att.mimeType,
            size: att.size,
          })),
        });
      } else {
        send({ type: "prompt", message: text });
      }
    },
    [send],
  );

  const setDraft = useCallback((draft: string) => {
    setState((prev) => ({ ...prev, draft }));
  }, []);

  const switchAgent = useCallback(
    (agentId: string) => {
      send({ type: "switch_agent", agentId });
    },
    [send],
  );

  const switchSession = useCallback(
    (sessionPath: string) => {
      setState((prev) => ({ ...prev, messages: [], streamingAssistant: null }));
      sendRequest("switch_session", { sessionPath });
    },
    [sendRequest],
  );

  const renameSession = useCallback(
    (sessionPath: string, label: string) => {
      sendRequest("rename_session", { sessionPath, label });
    },
    [sendRequest],
  );

  const deleteSession = useCallback(
    (sessionPath: string) => {
      sendRequest("delete_session", { sessionPath });
    },
    [sendRequest],
  );

  const createNewSession = useCallback(() => {
    send({ type: "prompt", message: "new" });
    setTimeout(() => {
      sendRequest("get_state");
      sendRequest("get_messages");
      sendRequest("list_sessions", { force: true });
    }, 300);
  }, [send, sendRequest]);

  const setModel = useCallback(
    (provider: string, modelId: string) => {
      sendRequest("set_model", { provider, modelId });
    },
    [sendRequest],
  );

  const refreshModels = useCallback(() => {
    sendRequest("get_available_models");
  }, [sendRequest]);

  const forkFromEntry = useCallback(
    (entryId: string) => {
      sendRequest("fork", { entryId });
    },
    [sendRequest],
  );

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState((prev) => ({ ...prev, status: "connecting" }));

    const wsUrl = new URL("/ws", window.location.href);
    appendAuthQuery(wsUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const connectionId = ++connectionIdRef.current;
    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (!shouldReconnectRef.current || connectionId !== connectionIdRef.current) return;
      reconnectAttemptsRef.current = 0;
      setState((prev) => ({ ...prev, status: "connected" }));
      sendRequest("get_state");
      sendRequest("get_messages");
      sendRequest("get_available_models");
      sendRequest("list_sessions");
    });

    ws.addEventListener("close", () => {
      if (!shouldReconnectRef.current || connectionId !== connectionIdRef.current) return;
      setState((prev) => ({ ...prev, status: "disconnected" }));
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!shouldReconnectRef.current) return;
        connect();
      }, delay);
    });

    ws.addEventListener("error", () => {
      if (!shouldReconnectRef.current || connectionId !== connectionIdRef.current) return;
      try {
        ws.close();
      } catch {
        // ignore
      }
    });

    ws.addEventListener("message", (event) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      const payloadType = typeof payload.type === "string" ? payload.type : null;
      if (!payloadType) {
        return;
      }

      if (payloadType === "gateway_ready") {
        const agents = Array.isArray(payload.agents) ? (payload.agents as GatewayAgent[]) : [];
        const activeId =
          (typeof payload.activeAgent === "string" && payload.activeAgent) ||
          (typeof payload.defaultAgent === "string" && payload.defaultAgent) ||
          null;
        const activeAgent = agents.find((agent: GatewayAgent) => agent.id === activeId);
        currentAgentIdRef.current = activeId;
        setState((prev) => ({
          ...prev,
          agents,
          currentAgentId: activeId,
          currentAgentName: activeAgent?.name || activeId,
          busy: false,
          queueLength: 0,
          sessions: [],
          sessionFile: null,
          model: null,
          availableModels: [],
          draft: "",
        }));
        return;
      }

      if (payloadType === "response") {
        const response = payload as {
          id?: string;
          command?: string;
          success?: boolean;
          data?: Record<string, unknown>;
        };
        const { id, command, success, data } = response;
        if (!id || !command) {
          return;
        }
        const pendingCommand = pendingRequestsRef.current.get(id);
        if (!pendingCommand || pendingCommand !== command) {
          return;
        }
        pendingRequestsRef.current.delete(id);

        if (command === "get_messages" && success) {
          const messages = Array.isArray(data?.messages)
            ? (data?.messages as GatewayMessage[])
            : [];
          setState((prev) => ({
            ...prev,
            messages,
          }));
          sendRequest("get_fork_messages");
        }

        if (command === "get_fork_messages" && success) {
          const forkMessages = Array.isArray(data?.messages)
            ? (data?.messages as ForkMessage[])
            : [];
          setState((prev) => ({
            ...prev,
            forkMessages,
          }));
        }

        if (command === "get_state" && success) {
          const stateData = data as { sessionFile?: string | null; model?: ModelState | null };
          setState((prev) => ({
            ...prev,
            sessionFile: stateData?.sessionFile || prev.sessionFile,
            model: stateData?.model || prev.model,
          }));
        }

        if (command === "list_sessions" && success) {
          const sessions = Array.isArray(data?.sessions) ? (data?.sessions as SessionEntry[]) : [];
          setState((prev) => ({
            ...prev,
            sessions,
          }));
        }

        if (command === "get_available_models" && success) {
          const models = Array.isArray(data?.models) ? (data?.models as AvailableModel[]) : [];
          setState((prev) => ({
            ...prev,
            availableModels: models,
          }));
        }

        if (command === "set_model" && success) {
          const model = data as ModelState | null;
          setState((prev) => ({
            ...prev,
            model: model || prev.model,
          }));
        }

        if (command === "switch_session" && success) {
          sendRequest("get_state");
          sendRequest("get_messages");
          sendRequest("list_sessions", { force: true });
        }

        if (command === "rename_session" && success) {
          sendRequest("list_sessions", { force: true });
        }

        if (command === "delete_session" && success) {
          sendRequest("list_sessions", { force: true });
        }

        if (command === "fork" && success) {
          const forkData = data as { cancelled?: boolean; text?: string } | undefined;
          if (!forkData?.cancelled) {
            setState((prev) => ({
              ...prev,
              draft: forkData?.text || "",
            }));
            refreshSessionState();
          }
        }

        return;
      }

      if (payloadType === "gateway_message") {
        const { text } = payload as { text?: string };
        const messageText = typeof text === "string" ? text : "";
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              role: "system",
              content: messageText,
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }

      if (payloadType === "gateway_agent_switched") {
        const agent = (payload as { agent?: GatewayAgent }).agent;
        currentAgentIdRef.current = agent?.id || null;
        setState((prev) => ({
          ...prev,
          currentAgentId: agent?.id || prev.currentAgentId,
          currentAgentName: agent?.name || prev.currentAgentName,
          busy: false,
          queueLength: 0,
          messages: [],
          streamingAssistant: null,
          draft: "",
        }));
        sendRequest("get_state");
        sendRequest("get_messages");
        sendRequest("get_available_models");
        sendRequest("list_sessions");
        return;
      }

      if (payloadType === "gateway_agent_status") {
        const statusPayload = payload as {
          agent?: GatewayAgent;
          busy?: boolean;
          queueLength?: number;
        };
        if (statusPayload.agent?.id && statusPayload.agent.id !== currentAgentIdRef.current) {
          return;
        }
        setState((prev) => ({
          ...prev,
          busy: !!statusPayload.busy,
          queueLength: Number(statusPayload.queueLength || 0),
        }));
        return;
      }

      if (payloadType === "message_start") {
        const message = payload.message as GatewayMessage;
        if (!message) return;
        if (message.role === "user" || message.role === "user-with-attachments") {
          const text = extractText(message.content);
          if (
            localPromptQueue.current.length > 0 &&
            text.trim() === localPromptQueue.current[0].trim()
          ) {
            localPromptQueue.current.shift();
            return;
          }
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, message],
          }));
        }
        return;
      }

      if (payloadType === "message_update") {
        const delta = (payload as { assistantMessageEvent?: { type?: string; delta?: string } })
          .assistantMessageEvent;
        if (delta?.type === "text_delta") {
          setState((prev) => ({
            ...prev,
            streamingAssistant: (prev.streamingAssistant || "") + (delta.delta || ""),
          }));
        }
        return;
      }

      if (payloadType === "message_end") {
        const message = payload.message as GatewayMessage;
        if (!message) {
          setState((prev) => ({ ...prev, streamingAssistant: null }));
          return;
        }
        if (message.role === "assistant" || message.role === "toolResult") {
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, message],
            streamingAssistant: null,
          }));
        }
        return;
      }

      if (payloadType === "agent_end") {
        sendRequest("get_messages");
        sendRequest("list_sessions");
      }
    });
  }, [refreshSessionState, sendRequest]);

  const reconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    state,
    sendPrompt,
    switchAgent,
    switchSession,
    renameSession,
    deleteSession,
    refreshSessions,
    createNewSession,
    setModel,
    refreshModels,
    forkFromEntry,
    setDraft,
    reconnect,
  };
};
