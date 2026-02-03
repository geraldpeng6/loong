import { resolve, sep } from "path";

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

export const createPublicFileResolver = (publicDir: string) => {
  const publicRoot = resolve(publicDir);
  return (pathname?: string | null): string | null => {
    if (!pathname) return null;
    const normalizedPath = pathname === "/" ? "/index.html" : pathname;
    const decodedPath = safeDecodeURIComponent(normalizedPath);
    if (!decodedPath || decodedPath.includes("\0")) return null;
    const resolvedPath = resolve(publicRoot, `.${decodedPath}`);
    if (resolvedPath !== publicRoot && !resolvedPath.startsWith(publicRoot + sep)) {
      return null;
    }
    return resolvedPath;
  };
};
