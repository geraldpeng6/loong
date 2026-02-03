import { homedir } from "os";
import { join, resolve } from "path";

export const resolveUserPath = (value: unknown, baseDir: string = homedir()): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return baseDir;
  if (trimmed.startsWith("~")) {
    const withoutTilde = trimmed.slice(1).replace(/^\/+/, "");
    return join(homedir(), withoutTilde);
  }
  if (trimmed.startsWith("/")) return trimmed;
  return resolve(baseDir, trimmed);
};
