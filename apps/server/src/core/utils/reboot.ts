import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const parseEnvFlag = (value: string | undefined, defaultValue: boolean) => {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
};

type RestartCommand = {
  cmd: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type RebootRequest = {
  reason?: string;
  source?: string;
  requester?: string;
  agentId?: string;
};

export type RebootResult = {
  ok: boolean;
  message: string;
  scheduledAt?: string;
  alreadyScheduled?: boolean;
};

export const resolveRestartCommand = ({
  projectRoot,
  env = process.env,
}: {
  projectRoot: string;
  env?: NodeJS.ProcessEnv;
}): RestartCommand | null => {
  const explicitCmd = env.LOONG_RESTART_CMD || env.LOONG_REBOOT_CMD || "";
  if (explicitCmd.trim()) {
    return { cmd: explicitCmd.trim(), cwd: projectRoot };
  }

  const systemdService = env.LOONG_SYSTEMD_SERVICE || "";
  if (systemdService.trim()) {
    return { cmd: `systemctl restart ${systemdService.trim()}`, cwd: projectRoot };
  }

  const launchdLabel = env.LOONG_LAUNCHD_LABEL || "";
  if (launchdLabel.trim()) {
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    const domain = env.LOONG_LAUNCHD_DOMAIN || `gui/${uid}`;
    return { cmd: `launchctl kickstart -k ${domain}/${launchdLabel.trim()}`, cwd: projectRoot };
  }

  const scriptPath = join(projectRoot, "loong.sh");
  if (existsSync(scriptPath)) {
    const quoted = scriptPath.includes(" ") ? `\"${scriptPath}\"` : scriptPath;
    return { cmd: `${quoted} restart`, cwd: projectRoot };
  }

  return null;
};

export const createRebootScheduler = ({
  projectRoot,
  logger = console,
  env = process.env,
}: {
  projectRoot: string;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
  env?: NodeJS.ProcessEnv;
}) => {
  const enabled = parseEnvFlag(env.LOONG_REBOOT_ENABLED, true);
  const delayMs = Number(env.LOONG_REBOOT_DELAY_MS || 1000);
  const command = resolveRestartCommand({ projectRoot, env });
  let scheduledAt: string | null = null;

  const schedule = (request: RebootRequest = {}): RebootResult => {
    if (!enabled) {
      return { ok: false, message: "重启功能未启用。" };
    }
    if (!command?.cmd) {
      return { ok: false, message: "重启未配置，请设置 LOONG_RESTART_CMD 或配置服务重启参数。" };
    }
    if (scheduledAt) {
      return {
        ok: true,
        message: "重启已安排，稍后执行。",
        scheduledAt,
        alreadyScheduled: true,
      };
    }

    scheduledAt = new Date().toISOString();
    const reasonLabel = request.reason ? ` reason=${request.reason}` : "";
    const sourceLabel = request.source ? ` source=${request.source}` : "";
    const requesterLabel = request.requester ? ` requester=${request.requester}` : "";
    const agentLabel = request.agentId ? ` agent=${request.agentId}` : "";
    logger.warn?.(
      `[loong] reboot scheduled in ${delayMs}ms.${reasonLabel}${sourceLabel}${requesterLabel}${agentLabel}`,
    );

    setTimeout(
      () => {
        try {
          const child = spawn(command.cmd, {
            shell: true,
            detached: true,
            stdio: "ignore",
            cwd: command.cwd || projectRoot,
            env: { ...process.env, ...(command.env || {}) },
          });
          child.unref();
          logger.warn?.(`[loong] reboot command spawned (pid ${child.pid}): ${command.cmd}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error?.(`[loong] reboot spawn failed: ${message}`);
        }
      },
      Math.max(0, delayMs),
    );

    return {
      ok: true,
      message: `已安排重启，约 ${Math.max(1, Math.ceil(delayMs / 1000))} 秒后执行。`,
      scheduledAt,
      alreadyScheduled: false,
    };
  };

  return { schedule, enabled, delayMs, command };
};
