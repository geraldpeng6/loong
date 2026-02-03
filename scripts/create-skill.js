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
const skillName = getArgValue("--name") || "";
const description = getArgValue("--description") || "";

if (!skillName) {
  console.error("Missing --name <skill-name>");
  process.exit(1);
}
if (!description) {
  console.error("Missing --description");
  process.exit(1);
}

const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (skillName.length > 64 || !nameRegex.test(skillName)) {
  console.error("Invalid skill name. Use lowercase letters, numbers, hyphens only (1-64 chars).");
  process.exit(1);
}

const targetDir = resolveUserPath(
  getArgValue("--target") || process.env.PI_SKILLS_DIR || "~/.pi/agent/skills",
);
const templatesDir = path.join(process.cwd(), "templates", "skills", "_template");
const templatePath = path.join(templatesDir, "SKILL.md");

const log = (message) => process.stdout.write(`${message}\n`);

if (!targetDir) {
  console.error("Missing target dir");
  process.exit(1);
}

const skillDir = path.join(targetDir, skillName);
const skillFile = path.join(skillDir, "SKILL.md");

if (fs.existsSync(skillDir) && !force) {
  log(`[skip] ${skillDir} already exists`);
  process.exit(0);
}

if (fs.existsSync(skillDir) && force) {
  if (dryRun) {
    log(`[dry-run] rm -rf ${skillDir}`);
  } else {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

const template = fs.existsSync(templatePath)
  ? fs.readFileSync(templatePath, "utf8")
  : "---\nname: {{SKILL_NAME}}\ndescription: {{SKILL_DESCRIPTION}}\n---\n\n# {{SKILL_NAME}}\n";

const content = template
  .replace(/{{SKILL_NAME}}/g, skillName)
  .replace(/{{SKILL_DESCRIPTION}}/g, description);

if (dryRun) {
  log(`[dry-run] mkdir -p ${skillDir}`);
  log(`[dry-run] write ${skillFile}`);
  process.exit(0);
}

fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(skillFile, content);
log(`[write] ${skillFile}`);
log("\nDone.");
