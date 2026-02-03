import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export const WORKSPACE_AGENTS_TEMPLATE = `# AGENTS.md - Workspace\n\nThis folder is home.\n\n## Every Session (required)\n1. Read SOUL.md (identity & behavior)\n2. Read MEMORY.md (long-term memory)\n3. If more context is needed, search memory/ for relevant dates/topics\n\n## Memory Workflow\n- memory/YYYY-MM-DD.md = daily logs (raw)\n- MEMORY.md = curated long-term memory\n- When the user says “remember”, write to today’s memory file and summarize into MEMORY.md\n\n## Search Guidance\n- Use rg/read to locate relevant entries in memory/\n- Summarize only what’s needed for the task\n\nKeep it concise, factual, and durable.\n`;

export const WORKSPACE_SOUL_TEMPLATE = `# SOUL\n\nDescribe the agent’s identity, tone, and behavioral boundaries here.\n`;

export const WORKSPACE_MEMORY_TEMPLATE = `# MEMORY\n\nThis file is your long-term memory. Always read it before working.\n\n## How to use\n- For missing context, search memory/ by keyword or date and pull only relevant parts\n- Record durable facts, preferences, decisions, and constraints\n- Keep sensitive data minimal; store only when explicitly asked\n\n## Index (optional)\n- Add brief pointers to important topics with links to memory/YYYY-MM-DD.md\n`;

export const ensureWorkspaceScaffold = ({
  workspaceDir,
  memoryIndexFile,
  memoryDir,
}: {
  workspaceDir?: string | null;
  memoryIndexFile?: string | null;
  memoryDir?: string | null;
}) => {
  if (!workspaceDir) return;
  mkdirSync(workspaceDir, { recursive: true });
  if (memoryDir) {
    mkdirSync(memoryDir, { recursive: true });
  }
  const agentsPath = join(workspaceDir, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, WORKSPACE_AGENTS_TEMPLATE);
  }
  const soulPath = join(workspaceDir, "SOUL.md");
  if (!existsSync(soulPath)) {
    writeFileSync(soulPath, WORKSPACE_SOUL_TEMPLATE);
  }
  if (memoryIndexFile && !existsSync(memoryIndexFile)) {
    writeFileSync(memoryIndexFile, WORKSPACE_MEMORY_TEMPLATE);
  }
};
