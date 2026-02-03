#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const binName = process.platform === "win32" ? "pi.cmd" : "pi";
const localCandidates = [
  join(ROOT, "node_modules", ".bin", binName),
  join(ROOT, "apps", "server", "node_modules", ".bin", binName),
];

const localPi = localCandidates.find((candidate) => existsSync(candidate));

const hasGlobalPi = () => {
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    execSync(`${whichCmd} pi`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

if (localPi || hasGlobalPi()) {
  process.exit(0);
}

console.error("Error: pi is not installed.");
console.error("Run: pnpm install (local) or pnpm add -g @mariozechner/pi-coding-agent");
process.exit(1);
