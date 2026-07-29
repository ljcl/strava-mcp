import { type App } from "@modelcontextprotocol/ext-apps";

type ServerToolResult = Awaited<ReturnType<App["callServerTool"]>>;

/**
 * Extract and JSON-parse the first text content of a CallToolResult — the
 * server's app-data response convention. Shared by `useServerToolData` and
 * `useServerToolFetcher` so the two paths cannot disagree about what a
 * well-formed response looks like.
 */
export function parseTextContent<T>(result: ServerToolResult): T | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
