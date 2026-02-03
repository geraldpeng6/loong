import { execSync } from "child_process";
import { existsSync } from "fs";

export const checkPiInstalled = (piCmd: string, logger: Console = console) => {
  const piCmdParts = piCmd.split(/\s+/).filter(Boolean);
  const cmd = piCmdParts[0];
  if (!cmd) {
    logger.error?.("[loong] Error: PI_CMD is not set");
    process.exit(1);
  }

  const isPath = cmd.includes("/") || cmd.includes("\\");
  if (isPath) {
    if (existsSync(cmd)) return;
    logger.error?.(`[loong] Error: '${cmd}' does not exist`);
    logger.error?.("[loong] Install deps (pnpm install) or set PI_CMD to a valid pi path.");
    process.exit(1);
  }

  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    execSync(`${whichCmd} ${cmd}`, { stdio: "ignore" });
  } catch {
    logger.error?.(`[loong] Error: '${cmd}' is not installed or not in PATH`);
    logger.error?.(
      "[loong] Install deps (pnpm install) or pnpm add -g @mariozechner/pi-coding-agent",
    );
    process.exit(1);
  }
};
