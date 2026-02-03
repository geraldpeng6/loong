import type { IncomingMessage, ServerResponse } from "http";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => boolean | Promise<boolean>;
