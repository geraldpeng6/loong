type AgentRuntime = {
  id: string;
  name: string;
  keywords: string[];
  pi?: { pid?: number } | null;
  listEntry?: unknown;
};

type GatewayConfig = {
  defaultAgent?: string | null;
};

type Logger = {
  error?: (message: string) => void;
};

export const initAgents = ({
  gatewayConfig,
  agents,
  agentList,
  createAgentRuntime,
  resolveAgentConfigs,
  validateAgentNames,
  logger = console,
}: {
  gatewayConfig: GatewayConfig;
  agents: Map<string, AgentRuntime>;
  agentList: Array<{ id: string; name: string; keywords: string[]; pid?: number }>;
  createAgentRuntime: (config: Record<string, unknown>) => AgentRuntime;
  resolveAgentConfigs: (config: GatewayConfig) => Array<Record<string, unknown>>;
  validateAgentNames: (configs: Array<Record<string, unknown>>) => boolean;
  logger?: Logger;
}) => {
  const agentConfigs = resolveAgentConfigs(gatewayConfig);
  if (agentConfigs.length === 0) return null;

  if (!validateAgentNames(agentConfigs)) {
    return null;
  }

  for (const agentConfig of agentConfigs) {
    const agent = createAgentRuntime(agentConfig);
    agents.set(agent.id, agent);
    const entry = {
      id: agent.id,
      name: agent.name,
      keywords: agent.keywords,
      pid: agent.pi?.pid,
    };
    agent.listEntry = entry;
    agentList.push(entry);
  }

  const defaultId =
    gatewayConfig.defaultAgent && agents.has(gatewayConfig.defaultAgent)
      ? gatewayConfig.defaultAgent
      : agentConfigs[0].id;

  if (!defaultId) {
    logger.error?.("[loong] no agents loaded; check config and agents directory");
    return null;
  }

  return defaultId;
};
