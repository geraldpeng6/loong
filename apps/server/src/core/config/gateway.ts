import { existsSync, readFileSync } from "fs";

export const loadGatewayConfig = ({
  configPath,
  defaults,
  logger = console,
}: {
  configPath: string;
  defaults: Record<string, unknown>;
  logger?: Console;
}) => {
  const base = { ...defaults };
  if (!existsSync(configPath)) {
    logger.warn?.(`[loong] config not found at ${configPath}, using defaults`);
    return base;
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...base, ...parsed };
  } catch (err) {
    logger.error?.(`[loong] failed to read config: ${err.message}`);
    return base;
  }
};
