import { createReadStream, statSync } from "fs";
import { extname } from "path";
import type { RouteHandler } from "../types.js";

export const createStaticRoute = ({ resolvePublicFilePath }): RouteHandler => {
  return (req, res, url) => {
    const filePath = resolvePublicFilePath(url.pathname);
    if (!filePath) {
      res.writeHead(404);
      res.end();
      return true;
    }

    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end();
        return true;
      }

      const ext = extname(filePath);
      const contentType =
        ext === ".html"
          ? "text/html"
          : ext === ".js"
            ? "text/javascript"
            : ext === ".css"
              ? "text/css"
              : "application/octet-stream";

      res.writeHead(200, { "content-type": contentType });
      createReadStream(filePath).pipe(res);
      return true;
    } catch {
      res.writeHead(404);
      res.end();
      return true;
    }
  };
};
