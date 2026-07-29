import { type App } from "@modelcontextprotocol/ext-apps";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { type KeyedFetchState, KeyedFetchStore } from "./keyedFetchStore";
import { parseTextContent } from "./serverToolResult";

export interface ServerToolFetcher<T> {
  /** Per-key state; a key absent from the map has never been requested. */
  entries: ReadonlyMap<string, KeyedFetchState<T>>;
  /** Fetch `key` unless it is already loaded, in flight, or failed. */
  request: (key: string) => void;
  /** Fetch `key` again after a failure — wire this to the retry control. */
  retry: (key: string) => void;
}

/**
 * `useServerToolData`'s sibling for the on-demand case: many payloads from
 * one tool, fetched as the user asks for them, each with its own loading,
 * error, and retry (#250). `useServerToolData` covers the mount-time single
 * fetch; anything keyed — a stream per selected run — belongs here rather
 * than in a hand-rolled effect.
 *
 * `buildArgs` maps a key to that call's arguments and is read through a ref,
 * so an inline arrow does not tear down the store on every render.
 */
export function useServerToolFetcher<T>(
  app: App | null,
  toolName: string,
  buildArgs: (key: string) => Record<string, unknown>,
): ServerToolFetcher<T> {
  const buildArgsRef = useRef(buildArgs);
  buildArgsRef.current = buildArgs;

  const store = useMemo(
    () =>
      new KeyedFetchStore<T>(async (key) => {
        if (!app) throw new Error(`Not connected to the host`);
        const result = await app.callServerTool({
          name: toolName,
          arguments: buildArgsRef.current(key),
        });
        const parsed = parseTextContent<T>(result);
        if (parsed === null) {
          throw new Error(`Failed to parse ${toolName} response`);
        }
        return parsed;
      }),
    [app, toolName],
  );

  const entries = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  // Requests made before the handshake completes are dropped rather than
  // recorded as failures; the caller's effect re-requests once `app` lands.
  const request = useCallback(
    (key: string) => {
      if (app) store.request(key);
    },
    [app, store],
  );

  const retry = useCallback(
    (key: string) => {
      if (app) store.retry(key);
    },
    [app, store],
  );

  return { entries, request, retry };
}
