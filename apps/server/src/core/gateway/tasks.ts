import type { FileStorageService, AttachmentReference } from "../files/types.js";

type AgentRuntime = {
  id: string;
  name?: string;
  offline?: boolean;
  busy: boolean;
  queue: Task[];
  currentTask: Task | null;
  currentSessionFile?: string | null;
  pending?: Map<string, unknown>;
};

type AgentRequestPayload = Record<string, unknown>;

type AgentRequestResponse = {
  data?: {
    messages?: unknown[];
  };
  success?: boolean;
};

type SubagentRun = {
  sessionFile?: string | null;
  updatedAt?: string;
};

export interface Task {
  id?: string;
  source: "web" | "imessage" | "api" | "subagent";
  text: string;
  ws?: unknown;
  sender?: string;
  chatId?: number;
  onReply?: (reply: string) => void;
  onStart?: () => void | Promise<void>;
  subagentRunId?: string;
  subagentDepth?: number;
  isSlashCommand?: boolean;
  replySent?: boolean;
  aborted?: boolean;
  agentStarted?: boolean;
  timeoutTimer?: ReturnType<typeof setTimeout> | null;
  slashCommandTimer?: ReturnType<typeof setTimeout> | null;
  baseMessageCount?: number | null;
  /** 附件列表 */
  attachments?: AttachmentReference[];
}

export interface CreateTaskRunnerOptions {
  taskTimeoutMs?: number;
  slashCommandTimeoutMs?: number;
  createTaskId?: () => string;
  isSlashCommandText?: (text: string) => boolean;
  sendAgentRequest?: (
    agent: AgentRuntime,
    command: AgentRequestPayload,
  ) => Promise<AgentRequestResponse | null>;
  sendToAgent?: (agent: AgentRuntime, payload: AgentRequestPayload) => void;
  ensureAgentSession?: (agent: AgentRuntime, task: Task) => Promise<string | null>;
  buildPromptText?: (task: Task) => string;
  notifyTaskMessage?: (agent: AgentRuntime, task: Task, text: string) => Promise<void>;
  broadcastAgentStatus?: (agent: AgentRuntime) => void;
  subagentRuns?: Map<string, SubagentRun>;
  persistSubagentRuns?: () => void;
  fileStorage?: FileStorageService | null;
}

export const createTaskRunner = ({
  taskTimeoutMs = 0,
  slashCommandTimeoutMs = 0,
  createTaskId,
  isSlashCommandText,
  sendAgentRequest,
  sendToAgent,
  ensureAgentSession,
  buildPromptText,
  notifyTaskMessage,
  broadcastAgentStatus,
  subagentRuns,
  persistSubagentRuns,
  fileStorage = null,
}: CreateTaskRunnerOptions) => {
  const clearTaskTimeout = (task: Task | null | undefined) => {
    if (task?.timeoutTimer) {
      clearTimeout(task.timeoutTimer);
      task.timeoutTimer = null;
    }
  };

  const clearSlashCommandTimer = (task: Task | null | undefined) => {
    if (task?.slashCommandTimer) {
      clearTimeout(task.slashCommandTimer);
      task.slashCommandTimer = null;
    }
  };

  const completeCurrentTask = (
    agent: AgentRuntime,
    task: Task | null | undefined,
    { skipQueue = false }: { skipQueue?: boolean } = {},
  ) => {
    if (!task) return;
    clearTaskTimeout(task);
    clearSlashCommandTimer(task);
    agent.busy = false;
    agent.currentTask = null;
    if (!skipQueue) {
      processNextAgent(agent);
    }
    broadcastAgentStatus?.(agent);
  };

  const failCurrentTask = async (
    agent: AgentRuntime,
    task: Task | null | undefined,
    text: string,
    { skipQueue = false }: { skipQueue?: boolean } = {},
  ) => {
    if (!task) return;
    task.aborted = true;
    clearTaskTimeout(task);
    clearSlashCommandTimer(task);
    if (notifyTaskMessage) {
      await notifyTaskMessage(agent, task, text);
    }
    agent.busy = false;
    agent.currentTask = null;
    if (!skipQueue) {
      processNextAgent(agent);
    }
    broadcastAgentStatus?.(agent);
  };

  const enqueueAgentPrompt = (agent: AgentRuntime, task: Task) => {
    if (agent.offline) {
      void notifyTaskMessage?.(agent, task, "代理当前不可用，请稍后再试。");
      return;
    }
    if (!task.id) {
      task.id = createTaskId
        ? createTaskId()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!Number.isFinite(task.subagentDepth)) {
      task.subagentDepth = 0;
    }
    if (typeof task.text === "string" && isSlashCommandText) {
      task.isSlashCommand = isSlashCommandText(task.text);
    }
    agent.queue.push(task);
    processNextAgent(agent);
    broadcastAgentStatus?.(agent);
  };
  /**
   * 构建带附件的 prompt 消息
   * 将附件转换为 Agent 可理解的格式
   */
  const buildPromptWithAttachments = async (task: Task): Promise<string> => {
    const baseText = buildPromptText?.(task) ?? task.text ?? "";

    if (!task.attachments || task.attachments.length === 0) {
      return baseText;
    }

    const attachmentParts: string[] = [];

    for (const att of task.attachments) {
      const fileId = att.fileId;
      const metadata = fileStorage ? await fileStorage.getMetadata(fileId) : null;

      if (!metadata) {
        attachmentParts.push(`<attachment fileId="${fileId}" error="file not found" />`);
        continue;
      }

      // 读取文件内容
      const fileBuffer = await fileStorage.readFile(fileId);
      if (!fileBuffer) {
        attachmentParts.push(
          `<attachment fileId="${fileId}" fileName="${metadata.fileName}" error="failed to read" />`,
        );
        continue;
      }

      // 将文件内容转为 base64
      const base64Content = fileBuffer.toString("base64");

      // 根据文件类型构建不同的标记
      const mimeType = metadata.mimeType;
      const fileName = metadata.fileName;

      if (mimeType.startsWith("image/")) {
        // 图片使用 data URL 格式
        attachmentParts.push(
          `<image mimeType="${mimeType}" fileName="${fileName}">${base64Content}</image>`,
        );
      } else if (mimeType.startsWith("audio/")) {
        attachmentParts.push(
          `<audio mimeType="${mimeType}" fileName="${fileName}">${base64Content}</audio>`,
        );
      } else if (mimeType.startsWith("video/")) {
        attachmentParts.push(
          `<video mimeType="${mimeType}" fileName="${fileName}">${base64Content}</video>`,
        );
      } else {
        // 其他文件类型
        attachmentParts.push(
          `<file mimeType="${mimeType}" fileName="${fileName}" size="${metadata.size}">${base64Content}</file>`,
        );
      }
    }

    // 组合文本和附件
    if (attachmentParts.length > 0) {
      return `${baseText}\n\n<attachments>\n${attachmentParts.join("\n")}\n</attachments>`;
    }

    return baseText;
  };

  const processNextAgent = async (agent: AgentRuntime) => {
    if (agent.offline) return;
    if (agent.busy || agent.queue.length === 0) return;
    agent.busy = true;
    agent.currentTask = agent.queue.shift() ?? null;

    const task = agent.currentTask;
    if (!task) {
      agent.busy = false;
      return;
    }

    if (taskTimeoutMs > 0) {
      task.timeoutTimer = setTimeout(() => {
        void failCurrentTask(agent, task, "处理超时，已取消。", { skipQueue: agent.offline });
      }, taskTimeoutMs);
    }
    if (task.isSlashCommand && slashCommandTimeoutMs > 0) {
      task.slashCommandTimer = setTimeout(() => {
        if (!task.agentStarted) {
          completeCurrentTask(agent, task, { skipQueue: agent.offline });
        }
      }, slashCommandTimeoutMs);
    }

    try {
      if (task.onStart) {
        try {
          await task.onStart();
        } catch (err) {
          const startMessage = err instanceof Error ? err.message : String(err);
          console.error(`[loong] task ${task.id} onStart failed: ${startMessage}`);
        }
      }

      const sessionFile = await ensureAgentSession?.(agent, task);
      if (task.subagentRunId && subagentRuns) {
        const run = subagentRuns.get(task.subagentRunId);
        if (run) {
          run.sessionFile = sessionFile || agent.currentSessionFile || null;
          run.updatedAt = new Date().toISOString();
          subagentRuns.set(task.subagentRunId, run);
          persistSubagentRuns?.();
        }
      }
      const snapshot = await sendAgentRequest?.(agent, { type: "get_messages" }).catch(() => null);
      task.baseMessageCount = snapshot?.data?.messages?.length ?? null;

      // 构建包含附件的 prompt
      const message = await buildPromptWithAttachments(task);

      sendToAgent?.(agent, { type: "prompt", message });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[loong] agent ${agent.id} session error: ${message}`);
      await failCurrentTask(agent, task, `启动失败：${message}`, {
        skipQueue: agent.offline,
      });
      return;
    } finally {
      broadcastAgentStatus?.(agent);
    }
  };

  return {
    enqueueAgentPrompt,
    processNextAgent,
    completeCurrentTask,
    failCurrentTask,
    clearTaskTimeout,
    clearSlashCommandTimer,
  };
};
