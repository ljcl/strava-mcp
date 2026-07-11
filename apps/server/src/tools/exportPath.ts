import * as path from "node:path";

/**
 * Resolve `filename` inside `exportDir`, refusing any result that escapes the
 * directory (e.g. via `..` segments or an absolute filename). Returns the
 * resolved absolute path, or null when containment would be violated.
 */
export function resolveContainedPath(
  exportDir: string,
  filename: string,
): string | null {
  const resolvedDir = path.resolve(exportDir);
  const fullPath = path.resolve(resolvedDir, filename);
  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return fullPath;
}
