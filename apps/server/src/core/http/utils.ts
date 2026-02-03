import type { IncomingMessage, ServerResponse } from "http";

export const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
};

export const isLocalRequest = (req: IncomingMessage): boolean => {
  const remote = req.socket?.remoteAddress || "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
};

export const readBody = <T = Record<string, unknown>>(
  req: IncomingMessage,
  { maxBytes = 0 }: { maxBytes?: number } = {},
): Promise<T> =>
  new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (maxBytes > 0 && bytes > maxBytes) {
        rejected = true;
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
