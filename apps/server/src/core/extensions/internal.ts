import { existsSync } from "fs";
import { resolve } from "path";

const parseEnvList = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseEnvFlag = (value: string | undefined) =>
  ["1", "true", "yes"].includes(String(value || "").toLowerCase());

export const createInternalExtensionsResolver = ({
  baseDir,
  resolveUserPath,
  env = process.env,
  extraExtensions = [],
}: {
  baseDir: string;
  resolveUserPath: (value: unknown, baseDir?: string) => string;
  env?: NodeJS.ProcessEnv;
  extraExtensions?: string[];
}) => {
  const disabled = parseEnvFlag(env.LOONG_INTERNAL_EXTENSIONS_DISABLED);
  const envList = parseEnvList(env.LOONG_INTERNAL_EXTENSIONS);
  const resolvedExtras = extraExtensions
    .map((entry) => resolveUserPath(entry, baseDir))
    .filter(Boolean);

  const defaultExtensions = [
    resolve(baseDir, "..", "extensions", "subagent-spawn.ts"),
    ...resolvedExtras,
  ];

  return () => {
    if (disabled) return [];
    if (envList.length > 0) {
      return envList
        .map((entry) => resolveUserPath(entry, baseDir))
        .filter((entry) => existsSync(entry));
    }
    return defaultExtensions.filter((entry) => existsSync(entry));
  };
};
