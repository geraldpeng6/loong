#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
};

const resolveUserPath = (value, fallback) => {
  const raw = value || fallback || "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~")) {
    const withoutTilde = trimmed.slice(1).replace(/^\/+/, "");
    return path.join(os.homedir(), withoutTilde);
  }
  return path.resolve(trimmed);
};

const dryRun = hasFlag("--dry-run");
const force = hasFlag("--force");
const targetDir = resolveUserPath(
  getArgValue("--target") || process.env.PI_AGENTS_DIR || "~/.pi/agent/agents",
);
const templatesDir = path.join(process.cwd(), "templates", "agents");

const log = (message) => process.stdout.write(`${message}\n`);

if (!fs.existsSync(templatesDir)) {
  log(`[loong] templates not found: ${templatesDir}`);
  process.exit(1);
}

if (!targetDir) {
  log("[loong] missing target directory");
  process.exit(1);
}

const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name);

if (files.length === 0) {
  log(`[loong] no template agents found in ${templatesDir}`);
  process.exit(0);
}

if (!dryRun) {
  fs.mkdirSync(targetDir, { recursive: true });
} else {
  log(`[dry-run] mkdir -p ${targetDir}`);
}

let copied = 0;
let skipped = 0;

for (const fileName of files) {
  const srcPath = path.join(templatesDir, fileName);
  const destPath = path.join(targetDir, fileName);
  if (fs.existsSync(destPath) && !force) {
    log(`[skip] ${destPath} already exists`);
    skipped += 1;
    continue;
  }
  if (dryRun) {
    log(`[dry-run] copy ${srcPath} -> ${destPath}`);
    copied += 1;
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  log(`[copy] ${srcPath} -> ${destPath}`);
  copied += 1;
}

log(`\nSummary: copied=${copied} skipped=${skipped}`);
if (dryRun) {
  log("Dry-run complete. Re-run with --force to overwrite existing files.");
}
