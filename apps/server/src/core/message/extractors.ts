export const extractTextBlocks = (content: unknown): string => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block) return "";
        if (block.type === "text") return block.text || "";
        if (block.type === "input_text") return block.text || "";
        return "";
      })
      .join("");
  }
  return "";
};

export const extractAssistantText = (
  messages: Array<{ role?: string; content?: unknown }> = [],
): string => {
  const assistant = [...messages].reverse().find((msg) => msg?.role === "assistant");
  return assistant ? extractTextBlocks(assistant.content) : "";
};
