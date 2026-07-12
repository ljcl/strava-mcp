import { type App } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useState } from "react";

type ServerToolResult = Awaited<ReturnType<App["callServerTool"]>>;

/** Extract and JSON-parse the first text content of a CallToolResult. */
function parseTextContent<T>(result: ServerToolResult): T | null {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export interface ServerToolData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-invokes the fetch (wired to the ErrorState retry control). */
  retry: () => void;
}

/**
 * Fetch/loading/error state machine for the app-only data tools every MCP
 * App calls on mount (#116) — previously ~40 lines duplicated per app's
 * main.tsx. The response convention is the server's app-data one: JSON in
 * the first text content block.
 *
 * `args` may be an inline object literal; the fetch is keyed on its JSON
 * serialization, so a new-but-equal object does not refetch.
 */
export function useServerToolData<T>(
  app: App | null,
  toolName: string,
  args: Record<string, unknown>,
): ServerToolData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const argsKey = JSON.stringify(args);

  const fetchData = useCallback(async () => {
    if (!app) return;
    try {
      setLoading(true);
      setError(null);
      const result = await app.callServerTool({
        name: toolName,
        arguments: JSON.parse(argsKey) as Record<string, unknown>,
      });
      const parsed = parseTextContent<T>(result);
      if (parsed === null) {
        setError(`Failed to parse ${toolName} response`);
        return;
      }
      setData(parsed);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [app, toolName, argsKey]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, retry: () => void fetchData() };
}
