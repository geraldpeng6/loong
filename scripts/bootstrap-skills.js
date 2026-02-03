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
  getArgValue("--target") || process.env.PI_SKILLS_DIR || "~/.pi/agent/skills",
);
const templatesDir = path.join(process.cwd(), "templates", "skills");

const log = (message) => process.stdout.write(`${message}\n`);

const copyDir = (srcDir, destDir) => {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
  } else {
    log(`[dry-run] mkdir -p ${destDir}`);
  }
  let copied = 0;
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyDir(srcPath, destPath);
      continue;
    }
    if (dryRun) {
      log(`[dry-run] copy ${srcPath} -> ${destPath}`);
      copied += 1;
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
    copied += 1;
  }
  return copied;
};

if (!fs.existsSync(templatesDir)) {
  log(`[loong] templates not found: ${templatesDir}`);
  process.exit(1);
}

if (!targetDir) {
  log("[loong] missing target directory");
  process.exit(1);
}

const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
const skillDirs = entries.filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_"),
);

if (skillDirs.length === 0) {
  log(`[loong] no skill templates found in ${templatesDir}`);
  process.exit(0);
}

if (!dryRun) {
  fs.mkdirSync(targetDir, { recursive: true });
} else {
  log(`[dry-run] mkdir -p ${targetDir}`);
}

let copiedTotal = 0;
let skippedTotal = 0;

for (const entry of skillDirs) {
  const srcPath = path.join(templatesDir, entry.name);
  const skillFile = path.join(srcPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    log(`[skip] ${entry.name} missing SKILL.md`);
    skippedTotal += 1;
    continue;
  }
  const destPath = path.join(targetDir, entry.name);
  if (fs.existsSync(destPath) && !force) {
    log(`[skip] ${destPath} already exists`);
    skippedTotal += 1;
    continue;
  }
  if (fs.existsSync(destPath) && force) {
    if (dryRun) {
      log(`[dry-run] rm -rf ${destPath}`);
    } else {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
  }
  const copied = copyDir(srcPath, destPath);
  copiedTotal += copied;
}

log(`\nSummary: copied=${copiedTotal} skipped=${skippedTotal}`);
if (dryRun) {
  log("Dry-run complete. Re-run with --force to overwrite existing skills.");
}
