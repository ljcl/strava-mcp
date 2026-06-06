import { useEffect, useRef } from "react";

/**
 * Minimal structural view of the ext-apps App needed for context sync.
 * Structurally compatible with the real App, so callers pass their app directly.
 */
export interface ModelContextApp {
  getHostCapabilities(): { updateModelContext?: unknown } | undefined;
  updateModelContext(params: {
    content: Array<{ type: "text"; text: string }>;
  }): Promise<unknown>;
}

const DEBOUNCE_MS = 600;

/**
 * Report app view state to the host's model context, debounced.
 *
 * No-ops unless the host advertises the `updateModelContext` capability, so it
 * is safe on every host. `buildSummary` returns the text to report, or `null`
 * when there is nothing to report yet (data not loaded). The latest dep change
 * wins; the host keeps only the last update.
 */
export function useModelContextSync(
  app: ModelContextApp | undefined,
  buildSummary: () => string | null,
  deps: unknown[],
): void {
  const buildRef = useRef(buildSummary);
  buildRef.current = buildSummary;

  useEffect(() => {
    if (!app) return;
    if (!app.getHostCapabilities()?.updateModelContext) return;

    const timer = setTimeout(() => {
      const text = buildRef.current();
      if (text == null) return;
      app
        .updateModelContext({ content: [{ type: "text", text }] })
        .catch(() => {
          // Host rejected or disconnected; degraded sync must not crash the UI.
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [app, ...deps]);
}
