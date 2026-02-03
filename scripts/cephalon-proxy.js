import http from "node:http";
import { Readable } from "node:stream";

const port = Number(process.env.CEPHALON_PROXY_PORT || 11435);
const upstreamUrl =
  process.env.CEPHALON_UPSTREAM_URL ||
  "https://cephalon.cloud/user-center/v1/model/chat/completions";

const getAuthHeader = (req) => {
  const envKey = process.env.CEPHALON_API_KEY;
  if (envKey) return `Bearer ${envKey}`;
  const header = req.headers.authorization;
  return header || "";
};

const normalizePayload = (payload) => {
  if (Array.isArray(payload.messages)) {
    payload.messages = payload.messages.map((msg) => {
      if (msg?.role === "developer") {
        return { ...msg, role: "system" };
      }
      return msg;
    });
  }

  if (payload.tool_choice !== undefined) {
    delete payload.tool_choice;
  }

  if (payload.tools !== undefined) {
    delete payload.tools;
  }

  if (payload.max_completion_tokens !== undefined && payload.max_tokens === undefined) {
    payload.max_tokens = payload.max_completion_tokens;
    delete payload.max_completion_tokens;
  }

  return payload;
};

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
  }

  let payload = {};
  if (body.trim().length > 0) {
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid JSON");
      return;
    }
  }

  payload = normalizePayload(payload);

  const authHeader = getAuthHeader(req);
  if (!authHeader) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Missing CEPHALON_API_KEY");
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: req.headers.accept || "*/*",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "content-encoding" || lower === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[cephalon-proxy] listening on http://127.0.0.1:${port}`);
  console.log(`[cephalon-proxy] upstream ${upstreamUrl}`);
});
