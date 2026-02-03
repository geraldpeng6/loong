type Logger = {
  log?: (message: string) => void;
};

export const logStartupInfo = ({
  logger = console,
  port,
  stateDir,
  agents,
  imessageEnabled,
  imessageInfo,
  imessageDisabledReason,
}: {
  logger?: Logger;
  port: number;
  stateDir: string;
  agents: Array<{ id: string }>;
  imessageEnabled: boolean;
  imessageInfo: { modeLabel: string; cliPath: string; dbPath: string };
  imessageDisabledReason: string;
}) => {
  logger.log?.(`[loong] listening on http://localhost:${port}`);
  logger.log?.(`[loong] websocket ws://localhost:${port}/ws`);
  logger.log?.(`[loong] api notify: POST http://localhost:${port}/api/notify`);
  logger.log?.(`[loong] api ask: POST http://localhost:${port}/api/ask`);
  logger.log?.(`[loong] loong state: ${stateDir}`);
  logger.log?.(`[loong] agents: ${agents.map((a) => a.id).join(", ")}`);
  if (imessageEnabled) {
    logger.log?.(
      `[loong] imessage enabled (${imessageInfo.modeLabel}, cli=${imessageInfo.cliPath}, db=${imessageInfo.dbPath})`,
    );
  } else {
    logger.log?.(`[loong] imessage disabled (${imessageDisabledReason})`);
  }
};
