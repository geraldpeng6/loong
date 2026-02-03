import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const createSubagentStore = ({
  runtimeDir,
  logger = console,
}: {
  runtimeDir: string;
  logger?: Console;
}) => {
  const runsFile = join(runtimeDir, "runs.json");
  const runs = new Map();
  const directReplies = new Map();

  const load = () => {
    if (!existsSync(runsFile)) return;
    try {
      const raw = readFileSync(runsFile, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry?.runId) continue;
          runs.set(entry.runId, entry);
        }
      }
    } catch (err) {
      logger.error?.(`[loong] failed to load subagent runs: ${err.message}`);
    }
  };

  const persist = () => {
    try {
      const payload = Array.from(runs.values());
      writeFileSync(runsFile, JSON.stringify(payload, null, 2));
    } catch (err) {
      logger.error?.(`[loong] failed to save subagent runs: ${err.message}`);
    }
  };

  return {
    runsFile,
    runs,
    directReplies,
    load,
    persist,
  };
};
