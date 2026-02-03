import type { RouteHandler } from "../types.js";

export const createHealthRoute = ({ agentList, defaultAgentId }): RouteHandler => {
  return (req, res, url) => {
    if (url.pathname !== "/health") return false;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        agents: agentList,
        defaultAgent: defaultAgentId,
      }),
    );
    return true;
  };
};
