import type { IncomingMessage, ServerResponse } from "http";

export const parseRequestUrl = (req: IncomingMessage): URL | null => {
  const host = req.headers.host || "localhost";
  try {
    return new URL(req.url || "/", `http://${host}`);
  } catch {
    return null;
  }
};

const getRequestPassword = (req: IncomingMessage, parsedUrl?: URL | null): string => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.trim()) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    if (trimmed.toLowerCase().startsWith("basic ")) {
      try {
        const decoded = Buffer.from(trimmed.slice(6), "base64").toString("utf8");
        const separator = decoded.indexOf(":");
        return separator >= 0 ? decoded.slice(separator + 1) : decoded;
      } catch {
        // ignore
      }
    }
  }
  const headerPassword = req.headers["x-loong-password"];
  if (typeof headerPassword === "string" && headerPassword.trim()) {
    return headerPassword.trim();
  }
  const url = parsedUrl || parseRequestUrl(req);
  const queryPassword = url?.searchParams?.get("password");
  if (queryPassword) return queryPassword;
  return "";
};

export const createRequestAuthorizer = ({
  passwordRequired,
  password,
}: {
  passwordRequired: boolean;
  password: string;
}) => {
  const isAuthorizedRequest = (req: IncomingMessage, parsedUrl?: URL | null): boolean => {
    if (!passwordRequired) return true;
    return getRequestPassword(req, parsedUrl) === password;
  };

  return { isAuthorizedRequest };
};

export const sendUnauthorized = (res: ServerResponse) => {
  res.writeHead(401, {
    "content-type": "text/plain",
    "www-authenticate": 'Basic realm="loong"',
  });
  res.end("Unauthorized");
};
