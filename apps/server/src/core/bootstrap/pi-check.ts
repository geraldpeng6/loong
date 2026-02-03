import { execSync } from "child_process";

export const checkPiInstalled = (piCmd: string, logger: Console = console) => {
  const piCmdParts = piCmd.split(/\s+/).filter(Boolean);
  const cmd = piCmdParts[0];
  if (!cmd) {
    logger.error?.("[loong] Error: PI_CMD is not set");
    process.exit(1);
  }
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
  } catch {
    logger.error?.(`[loong] Error: '${cmd}' is not installed or not in PATH`);
    logger.error?.("[loong] Please install pi: npm install -g @mariozechner/pi-coding-agent");
    process.exit(1);
  }
};
