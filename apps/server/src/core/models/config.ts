import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export const createModelsConfigStore = ({
  modelsPath,
  logger = console,
}: {
  modelsPath: string;
  logger?: Console;
}) => {
  const read = () => {
    if (!existsSync(modelsPath)) {
      return { providers: {} };
    }
    try {
      const raw = readFileSync(modelsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { providers: {} };
      }
      return parsed;
    } catch (err) {
      logger.warn?.(`[loong] failed to read models config: ${err.message}`);
      return { providers: {} };
    }
  };

  const write = (config) => {
    try {
      mkdirSync(dirname(modelsPath), { recursive: true });
      writeFileSync(modelsPath, JSON.stringify(config, null, 2));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  return { read, write };
};
