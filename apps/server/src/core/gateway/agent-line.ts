export const createAgentLineHandler = ({
  handleAgentResponse,
  handleAgentEvent,
  broadcastAgentPayload,
  debug = false,
}) => {
  return (agent, line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let payload;
    let normalizedLine = trimmed;
    try {
      payload = JSON.parse(trimmed);
    } catch (err) {
      const braceIndex = trimmed.indexOf("{");
      if (braceIndex > 0) {
        const sliced = trimmed.slice(braceIndex);
        try {
          payload = JSON.parse(sliced);
          normalizedLine = sliced;
        } catch (innerErr) {
          if (debug) {
            const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
            console.warn(`[loong] failed to parse agent ${agent.id} output: ${message}`);
          }
        }
      } else if (debug) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[loong] failed to parse agent ${agent.id} output: ${message}`);
      }
    }

    if (payload) {
      const handled = handleAgentResponse?.(agent, payload);
      if (!handled) {
        handleAgentEvent?.(agent, payload);
      }
    }

    if (!payload) return;
    broadcastAgentPayload?.(agent.id, normalizedLine);
  };
};
