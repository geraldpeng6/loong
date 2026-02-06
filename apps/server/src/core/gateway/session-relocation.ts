type SessionInfo = {
  sessionId: string;
  sessionPath: string;
  label?: string | null;
  createdAt?: string | null;
};

type RelocateResult = {
  ok: boolean;
  missing?: boolean;
  error?: string;
};

type RelocateAndSwitchOptions = {
  agent: unknown;
  sourceSessionFile: string;
  createSessionPath: (agent: unknown) => SessionInfo;
  relocateSessionFile: (fromPath: string, toPath: string) => RelocateResult;
  upsertSessionIndexEntry: (agent: unknown, sessionInfo: SessionInfo) => void;
  sendAgentRequest: (
    agent: unknown,
    payload: Record<string, unknown>,
  ) => Promise<{ success?: boolean; error?: unknown } | null>;
  logWarn?: (message: string) => void;
  contextLabel?: string;
};

const toErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  return String(value || "unknown error");
};

export const relocateAndSwitchSession = async ({
  agent,
  sourceSessionFile,
  createSessionPath,
  relocateSessionFile,
  upsertSessionIndexEntry,
  sendAgentRequest,
  logWarn = console.warn,
  contextLabel = "session",
}: RelocateAndSwitchOptions): Promise<string> => {
  const sessionInfo = createSessionPath(agent);
  const relocateResult = relocateSessionFile(sourceSessionFile, sessionInfo.sessionPath);

  if (!relocateResult.ok) {
    if (!relocateResult.missing) {
      logWarn(
        `[loong] failed to relocate ${contextLabel}: ${relocateResult.error || "unknown error"}`,
      );
    }
    return sourceSessionFile;
  }

  let switchFailure = "";
  const switchResp = await sendAgentRequest(agent, {
    type: "switch_session",
    sessionPath: sessionInfo.sessionPath,
  }).catch((err) => {
    switchFailure = toErrorMessage(err);
    return null;
  });

  if (!switchResp || switchResp.success === false) {
    const rollbackResult = relocateSessionFile(sessionInfo.sessionPath, sourceSessionFile);
    if (!rollbackResult.ok && !rollbackResult.missing) {
      logWarn(
        `[loong] failed to rollback relocated ${contextLabel}: ${rollbackResult.error || "unknown error"}`,
      );
    }
    if (rollbackResult.ok) {
      await sendAgentRequest(agent, {
        type: "switch_session",
        sessionPath: sourceSessionFile,
      }).catch(() => null);
    }

    const reason = switchFailure || toErrorMessage(switchResp?.error);
    logWarn(`[loong] failed to switch ${contextLabel} after relocation: ${reason}`);
    return sourceSessionFile;
  }

  upsertSessionIndexEntry(agent, sessionInfo);
  return sessionInfo.sessionPath;
};
