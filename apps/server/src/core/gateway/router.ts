export const resolveAgentFromText = ({ text, currentAgentId, agents, defaultAgentId }) => {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const lowered = trimmed.toLowerCase();
  const boundaryChars = new Set([
    "",
    " ",
    "\n",
    "\t",
    ":",
    "：",
    ",",
    "，",
    ".",
    "。",
    "!",
    "！",
    "?",
    "？",
    "、",
    "-",
  ]);

  const agentValues = agents ? Array.from(agents.values()) : [];

  const isMediaCommand = /^\/(img|audio)\b/i.test(trimmed);
  if (isMediaCommand && agentValues.length > 0) {
    const qiuniuAgent = agentValues.find((agent) => {
      const id = String(agent?.id || "").toLowerCase();
      if (id === "qiuniu" || id === "囚牛") return true;
      const keywords = Array.isArray(agent?.keywords) ? agent.keywords : [];
      return keywords.some((keyword) => {
        const raw = String(keyword || "");
        return raw === "囚牛" || raw.toLowerCase() === "qiuniu";
      });
    });
    if (qiuniuAgent) {
      return {
        agent: qiuniuAgent,
        remainder: trimmed,
        switched: qiuniuAgent.id !== currentAgentId,
      };
    }
  }

  for (const agent of agentValues) {
    const keywords = [...agent.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of keywords) {
      if (!keyword) continue;
      const loweredKeyword = keyword.toLowerCase();
      if (!lowered.startsWith(loweredKeyword)) continue;
      const nextChar = lowered[loweredKeyword.length] || "";
      if (!boundaryChars.has(nextChar)) continue;
      let remainder = trimmed.slice(keyword.length).trim();
      remainder = remainder.replace(/^[:：,，\-]+/, "").trim();
      return {
        agent,
        remainder,
        switched: agent.id !== currentAgentId,
      };
    }
  }

  const fallbackAgent =
    (currentAgentId && agents?.get(currentAgentId)) ||
    (defaultAgentId && agents?.get(defaultAgentId));

  return {
    agent: fallbackAgent || null,
    remainder: trimmed,
    switched: false,
  };
};
