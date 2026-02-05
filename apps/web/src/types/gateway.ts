export type GatewayStatus = "connecting" | "connected" | "disconnected";

export type GatewayAgent = {
  id: string;
  name?: string;
  keywords?: string[];
};

export type ModelState = {
  provider: string;
  id: string;
};

export type SessionEntry = {
  id: string;
  name?: string;
  path: string;
  sizeText?: string;
  isCurrent?: boolean;
};

export type ToolCallBlock = {
  type: "toolCall" | "tool_call";
  id?: string;
  name?: string;
  arguments?: Record<string, unknown> | string;
  partialJson?: string;
};

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "input_text"; text: string }
  | { type: "image"; data: string; mimeType?: string }
  | ToolCallBlock;

export type GatewayMessage = {
  role: "user" | "user-with-attachments" | "assistant" | "toolResult" | "system";
  content: string | MessageBlock[];
  timestamp?: string | number;
  attachments?: Array<{
    mimeType?: string;
    content?: string;
    fileName?: string;
    preview?: string;
    url?: string;
  }>;
  stopReason?: string;
  errorMessage?: string;
  error?: { message?: string };
  toolName?: string;
  toolCallId?: string;
};

export type ForkMessage = {
  entryId: string;
};

export type AvailableModel = {
  provider: string;
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  baseUrl?: string;
  compat?: Record<string, unknown>;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};
