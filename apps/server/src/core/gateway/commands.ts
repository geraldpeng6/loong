const matchVoiceCommand = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^new\b\s*(.*)$/i);
  if (!match) return null;

  const remainder = match[1]?.trim() || "";
  if (/^(chat|session)\b/i.test(remainder)) return null;

  return { type: "new_session", remainder };
};

export const matchRebootCommand = (text) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;

  const match = trimmed.match(/^\/(reboot|restart)\b(.*)$/i);
  if (!match) return null;

  const remainder = match[2]?.trim() || "";
  return { type: "reboot", remainder };
};

export const resolveCommand = (text) => matchRebootCommand(text) || matchVoiceCommand(text);

export const isSlashCommandText = (text) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return false;
  return trimmed.length > 1 && !trimmed.startsWith("//");
};
