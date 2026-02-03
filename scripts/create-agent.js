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

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const dryRun = hasFlag("--dry-run");
const force = hasFlag("--force");
const agentId = getArgValue("--id") || getArgValue("--agent-id") || "";
const nameZh = getArgValue("--name-zh") || "";
const nameEn = getArgValue("--name-en") || "";
const description = getArgValue("--description") || "";
const modelId = getArgValue("--model") || "";
const provider = getArgValue("--provider") || "";
const thinkingLevel = getArgValue("--thinking") || getArgValue("--thinking-level") || "";
const tools = normalizeList(getArgValue("--tools") || "read, write, edit, bash");
const keywords = normalizeList(getArgValue("--keywords"));
const skills = normalizeList(getArgValue("--skills"));
const noSkills = hasFlag("--no-skills");

if (!agentId) {
  console.error("Missing --id <agent-id>");
  process.exit(1);
}
if (!nameZh || !nameEn) {
  console.error("Missing --name-zh and/or --name-en");
  process.exit(1);
}
if (!description) {
  console.error("Missing --description");
  process.exit(1);
}

const agentsDir = resolveUserPath(
  getArgValue("--agents-dir") || process.env.PI_AGENTS_DIR || "~/.pi/agent/agents",
);
const stateDir = resolveUserPath(
  getArgValue("--state-dir") || process.env.LOONG_STATE_DIR || "~/.loong",
);
const workspaceDir = path.join(stateDir, "workspaces", agentId);
const templatesDir = path.join(process.cwd(), "templates", "workspace");

const log = (message) => process.stdout.write(`${message}\n`);

const writeFile = (filePath, content) => {
  if (fs.existsSync(filePath) && !force) {
    log(`[skip] ${filePath} already exists`);
    return false;
  }
  if (dryRun) {
    log(`[dry-run] write ${filePath}`);
    return true;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  log(`[write] ${filePath}`);
  return true;
};

const applyTokens = (template) => {
  return template
    .replace(/{{AGENT_ID}}/g, agentId)
    .replace(/{{NAME_ZH}}/g, nameZh)
    .replace(/{{NAME_EN}}/g, nameEn)
    .replace(/{{DESCRIPTION}}/g, description);
};

const loadTemplate = (fileName, fallback) => {
  const filePath = path.join(templatesDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8");
};

const resolvedKeywords = Array.from(
  new Set([agentId, nameZh, nameEn, ...keywords].filter(Boolean)),
);

const frontmatterLines = ["---", `name: ${agentId}`, `description: ${description}`];

if (resolvedKeywords.length > 0) {
  frontmatterLines.push("keywords:");
  for (const keyword of resolvedKeywords) {
    frontmatterLines.push(`  - ${keyword}`);
  }
}

if (tools.length === 0) {
  frontmatterLines.push("tools: []");
} else {
  frontmatterLines.push("tools:");
  for (const tool of tools) {
    frontmatterLines.push(`  - ${tool}`);
  }
}

if (modelId) {
  frontmatterLines.push(`model: ${modelId}`);
}
if (provider) {
  frontmatterLines.push(`provider: ${provider}`);
}
if (thinkingLevel) {
  frontmatterLines.push(`thinkingLevel: ${thinkingLevel}`);
}
if (noSkills) {
  frontmatterLines.push("noSkills: true");
} else if (skills.length > 0) {
  frontmatterLines.push("skills:");
  for (const skill of skills) {
    frontmatterLines.push(`  - ${skill}`);
  }
}

frontmatterLines.push("---");

const systemPrompt = `You are ${nameEn} (${nameZh}). Read AGENTS.md and SOUL.md before working. Use MEMORY.md for long-term memory.`;
const agentContent = `${frontmatterLines.join("\n")}\n${systemPrompt}\n`;

const agentFilePath = path.join(agentsDir, `${agentId}.md`);
writeFile(agentFilePath, agentContent);

const agentsTemplate = loadTemplate(
  "AGENTS.md",
  "# AGENTS\n\nRead SOUL.md and MEMORY.md every session.\n",
);
const soulTemplate = loadTemplate("SOUL.md", "# SOUL\n\nDescribe identity and behavior.\n");
const memoryTemplate = loadTemplate("MEMORY.md", "# MEMORY\n\nLong-term memory.\n");

const workspaceFiles = [
  { name: "AGENTS.md", content: applyTokens(agentsTemplate) },
  { name: "SOUL.md", content: applyTokens(soulTemplate) },
  { name: "MEMORY.md", content: applyTokens(memoryTemplate) },
];

for (const file of workspaceFiles) {
  const filePath = path.join(workspaceDir, file.name);
  writeFile(filePath, file.content);
}

const memoryDir = path.join(workspaceDir, "memory");
if (fs.existsSync(memoryDir) && !force) {
  log(`[skip] ${memoryDir} already exists`);
} else if (dryRun) {
  log(`[dry-run] mkdir -p ${memoryDir}`);
} else {
  fs.mkdirSync(memoryDir, { recursive: true });
  log(`[mkdir] ${memoryDir}`);
}

log("\nDone.");
