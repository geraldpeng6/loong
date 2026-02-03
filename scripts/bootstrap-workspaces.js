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
const targetDir = resolveUserPath(getArgValue("--target") || "~/.loong/workspaces");
const templatesRoot = path.join(process.cwd(), "templates");
const genericDir = path.join(templatesRoot, "workspace");
const workspacesDir = path.join(templatesRoot, "workspaces");

const log = (message) => process.stdout.write(`${message}\n`);

if (!fs.existsSync(workspacesDir)) {
  log(`[loong] workspace templates not found: ${workspacesDir}`);
  process.exit(1);
}

if (!targetDir) {
  log("[loong] missing target directory");
  process.exit(1);
}

const agentDirs = fs
  .readdirSync(workspacesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (agentDirs.length === 0) {
  log(`[loong] no workspace templates found in ${workspacesDir}`);
  process.exit(0);
}

const copyFile = (srcPath, destPath) => {
  if (fs.existsSync(destPath) && !force) {
    log(`[skip] ${destPath} already exists`);
    return false;
  }
  if (dryRun) {
    log(`[dry-run] copy ${srcPath} -> ${destPath}`);
    return true;
  }
  fs.copyFileSync(srcPath, destPath);
  log(`[copy] ${srcPath} -> ${destPath}`);
  return true;
};

let copied = 0;
let skipped = 0;

for (const agentId of agentDirs) {
  const agentTemplateDir = path.join(workspacesDir, agentId);
  const destDir = path.join(targetDir, agentId);
  const memoryDir = path.join(destDir, "memory");

  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
  } else {
    log(`[dry-run] mkdir -p ${destDir}`);
    log(`[dry-run] mkdir -p ${memoryDir}`);
  }

  const soulPath = path.join(agentTemplateDir, "SOUL.md");
  if (fs.existsSync(soulPath)) {
    const destSoul = path.join(destDir, "SOUL.md");
    if (copyFile(soulPath, destSoul)) {
      copied += 1;
    } else {
      skipped += 1;
    }
  }

  const genericFiles = ["AGENTS.md", "MEMORY.md"];
  for (const fileName of genericFiles) {
    const genericPath = path.join(genericDir, fileName);
    if (!fs.existsSync(genericPath)) continue;
    const destPath = path.join(destDir, fileName);
    if (copyFile(genericPath, destPath)) {
      copied += 1;
    } else {
      skipped += 1;
    }
  }
}

log(`\nSummary: copied=${copied} skipped=${skipped}`);
if (dryRun) {
  log("Dry-run complete. Re-run with --force to overwrite existing files.");
}
