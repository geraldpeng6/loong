export type CompatRouting = {
  only?: string[];
  order?: string[];
};

export type CompatConfig = {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresMistralToolIds?: boolean;
  thinkingFormat?: "openai" | "zai" | "qwen";
  supportsStrictMode?: boolean;
  openRouterRouting?: CompatRouting;
  vercelGatewayRouting?: CompatRouting;
  [key: string]: unknown;
};

export type ModelEntry = {
  id: string;
  name?: string;
  provider?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number | null;
  maxTokens?: number | null;
  compat?: CompatConfig | null;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  } | null;
};

export type ProviderCatalog = {
  id: string;
  name: string;
  description?: string | null;
  models: ModelEntry[];
};

export type ProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: CompatConfig;
  models?: ModelEntry[];
};

export type ModelsConfig = {
  providers: Record<string, ProviderConfig>;
};
