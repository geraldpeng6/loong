import { mkdirSync } from "fs";
import { dirname } from "path";
import { spawn } from "child_process";
import { createInterface } from "readline";

export const createAgentRuntimeFactory = ({
  piCmd,
  piBaseArgs,
  piCwd,
  port,
  resolveInternalExtensionPaths,
  ensureWorkspaceScaffold,
  getHandleAgentLine,
  getHandleAgentExit,
  env = process.env,
}) => {
  const spawnAgentProcess = (runtime) => {
    if (runtime.rl) {
      runtime.rl.removeAllListeners();
      runtime.rl.close();
    }

    const pi = spawn(runtime.piCmd, runtime.spawnArgs, {
      cwd: runtime.spawnCwd,
      stdio: ["pipe", "pipe", "inherit"],
      env: runtime.spawnEnv,
    });

    runtime.pi = pi;
    runtime.offline = false;
    if (runtime.listEntry) {
      runtime.listEntry.pid = pi.pid;
    }

    const rl = createInterface({ input: pi.stdout });
    runtime.rl = rl;
    rl.on("line", (line) => {
      const handleAgentLine = getHandleAgentLine?.();
      handleAgentLine?.(runtime, line);
    });

    pi.on("exit", (code, signal) => {
      const reason = `agent ${runtime.id} exited (code=${code}, signal=${signal})`;
      console.error(`[loong] ${reason}`);
      const handleAgentExit = getHandleAgentExit?.();
      void handleAgentExit?.(runtime, reason);
    });

    pi.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[loong] agent ${runtime.id} error: ${message}`);
      const handleAgentExit = getHandleAgentExit?.();
      void handleAgentExit?.(runtime, `agent error: ${message}`);
    });

    return pi;
  };

  const createAgentRuntime = (config) => {
    if (config.workspaceDir) {
      ensureWorkspaceScaffold({
        workspaceDir: config.workspaceDir,
        memoryIndexFile: config.memoryIndexFile,
        memoryDir: config.memoryDir,
      });
    }
    if (config.sessionRootDir) {
      mkdirSync(config.sessionRootDir, { recursive: true });
    }
    mkdirSync(config.sessionDir, { recursive: true });
    if (config.sessionIndexFile) {
      mkdirSync(dirname(config.sessionIndexFile), { recursive: true });
    }
    if (config.memoryEnabled) {
      mkdirSync(config.memoryDir, { recursive: true });
    }

    const args = [...piBaseArgs, "--mode", "rpc", "--session-dir", config.sessionDir];
    const internalExtensions = resolveInternalExtensionPaths?.() ?? [];
    for (const extensionPath of internalExtensions) {
      args.push("--extension", extensionPath);
    }
    if (config.systemPromptPath) {
      args.push("--system-prompt", config.systemPromptPath);
    } else if (config.systemPrompt) {
      args.push("--system-prompt", config.systemPrompt);
    }
    if (config.appendSystemPromptPath) {
      args.push("--append-system-prompt", config.appendSystemPromptPath);
    } else if (config.appendSystemPrompt) {
      args.push("--append-system-prompt", config.appendSystemPrompt);
    }
    if (config.model?.provider) {
      args.push("--provider", config.model.provider);
    }
    if (config.model?.modelId) {
      args.push("--model", config.model.modelId);
    }
    if (config.thinkingLevel) {
      args.push("--thinking", config.thinkingLevel);
    }
    if (Array.isArray(config.tools)) {
      if (config.tools.length === 0) {
        args.push("--no-tools");
      } else {
        args.push("--tools", config.tools.join(","));
      }
    }
    if (config.noSkills) {
      args.push("--no-skills");
    }
    if (Array.isArray(config.skills) && config.skills.length > 0) {
      for (const skill of config.skills) {
        args.push("--skill", skill);
      }
    }

    const runtime = {
      id: config.id,
      name: config.name,
      keywords: config.keywords,
      workspaceDir: config.workspaceDir,
      sessionRootDir: config.sessionRootDir,
      sessionDir: config.sessionDir,
      sessionIndexFile: config.sessionIndexFile,
      memoryDir: config.memoryDir,
      memoryIndexFile: config.memoryIndexFile,
      memoryEnabled: config.memoryEnabled,
      sessionMapFile: config.sessionMapFile,
      notifyOnStart: config.notifyOnStart,
      replyPrefixMode: config.replyPrefixMode,
      subagents: config.subagents || { allowAgents: null, maxDepth: null },
      pi: null,
      piCmd,
      spawnArgs: args,
      spawnCwd: config.workspaceDir || piCwd,
      spawnEnv: {
        ...env,
        LOONG_AGENT_ID: config.id,
        LOONG_PORT: String(port),
      },
      pending: new Map(),
      requestId: 0,
      currentSessionFile: null,
      queue: [],
      busy: false,
      currentTask: null,
      offline: false,
      sessionCache: null,
      restartTimer: null,
      rl: null,
      listEntry: null,
      imessageSessions: new Map(),
    };

    spawnAgentProcess(runtime);

    return runtime;
  };

  return { createAgentRuntime, spawnAgentProcess };
};
