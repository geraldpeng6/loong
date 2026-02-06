import { relocateAndSwitchSession } from "./session-relocation.js";

export const createGatewayHandlers = ({
  sendAgentRequest,
  createSessionPath,
  relocateSessionFile,
  upsertSessionIndexEntry,
  updateSessionMapping,
  scheduleReboot,
}) => {
  const resolveModelSpec = async (agent, token) => {
    if (!token || !token.includes("/")) return null;
    const [provider, modelId] = token.split("/");
    if (!provider || !modelId) {
      return { error: "模型格式应为 provider/model" };
    }
    const response = await sendAgentRequest(agent, { type: "get_available_models" });
    const models = response?.data?.models ?? [];
    const found = models.find((model) => model.provider === provider && model.id === modelId);
    if (!found) {
      return { error: `模型不存在: ${provider}/${modelId}` };
    }
    return { provider, modelId };
  };

  const handleRebootCommand = async ({ agent, command, respond, source, requester }) => {
    if (!scheduleReboot) {
      await respond("重启功能未配置。");
      return true;
    }

    const result = scheduleReboot({
      reason: command.remainder,
      source,
      requester,
      agentId: agent?.id,
    });

    await respond(result.message);
    return true;
  };

  const handleGatewayCommand = async ({
    agent,
    command,
    respond,
    sendPrompt,
    contextKey,
    source,
    requester,
  }) => {
    if (!command) return false;

    if (command.type === "reboot") {
      return handleRebootCommand({ agent, command, respond, source, requester });
    }

    if (command.type !== "new_session") return false;
    const { remainder } = command;

    const trimmed = remainder.trim();
    let promptText = trimmed;
    let modelSpec = null;
    if (trimmed) {
      const [candidate, ...rest] = trimmed.split(/\s+/);
      if (candidate && candidate.includes("/")) {
        const resolved = await resolveModelSpec(agent, candidate);
        if (resolved?.error) {
          await respond(resolved.error);
          return true;
        }
        modelSpec = resolved;
        promptText = rest.join(" ").trim();
      }
    }

    await sendAgentRequest(agent, { type: "new_session" });
    if (modelSpec) {
      await sendAgentRequest(agent, {
        type: "set_model",
        provider: modelSpec.provider,
        modelId: modelSpec.modelId,
      });
    }
    const state = await sendAgentRequest(agent, { type: "get_state" }).catch(() => null);
    const sessionFile = state?.data?.sessionFile ?? null;
    if (!sessionFile) {
      await respond("新建会话失败（未获取到 session 文件）");
      return true;
    }

    let activeSessionFile = sessionFile;
    activeSessionFile = await relocateAndSwitchSession({
      agent,
      sourceSessionFile: sessionFile,
      createSessionPath,
      relocateSessionFile,
      upsertSessionIndexEntry,
      sendAgentRequest,
      logWarn: console.warn,
      contextLabel: "new-session command",
    });

    agent.currentSessionFile = activeSessionFile;
    updateSessionMapping(agent, contextKey, activeSessionFile);

    if (promptText) {
      sendPrompt(promptText);
    } else {
      const modelNote = modelSpec ? ` (${modelSpec.provider}/${modelSpec.modelId})` : "";
      await respond(`已创建新会话${modelNote}。`);
    }
    return true;
  };

  return { handleGatewayCommand, resolveModelSpec };
};
