import { mkdirSync } from "fs";

export const ensureStateDirs = ({
  loongStateDir,
  loongWorkspacesDir,
  loongSessionsDir,
  loongUsersDir,
  loongRuntimeChannelsDir,
  loongRuntimeOutboundDir,
  loongRuntimeSubagentsDir,
  imessageEnabled,
  imessageSessionMapDir,
  imessageOutboundDir,
}: {
  loongStateDir: string;
  loongWorkspacesDir: string;
  loongSessionsDir: string;
  loongUsersDir: string;
  loongRuntimeChannelsDir: string;
  loongRuntimeOutboundDir: string;
  loongRuntimeSubagentsDir: string;
  imessageEnabled: boolean;
  imessageSessionMapDir: string;
  imessageOutboundDir: string;
}) => {
  mkdirSync(loongStateDir, { recursive: true });
  mkdirSync(loongWorkspacesDir, { recursive: true });
  mkdirSync(loongSessionsDir, { recursive: true });
  mkdirSync(loongUsersDir, { recursive: true });
  mkdirSync(loongRuntimeChannelsDir, { recursive: true });
  mkdirSync(loongRuntimeOutboundDir, { recursive: true });
  mkdirSync(loongRuntimeSubagentsDir, { recursive: true });
  if (imessageEnabled) {
    mkdirSync(imessageSessionMapDir, { recursive: true });
    mkdirSync(imessageOutboundDir, { recursive: true });
  }
};
