import { describe, expect, it, vi } from "vitest";
import { KeyedFetchStore } from "./keyedFetchStore";

/** A fetcher whose per-key promises resolve or reject on command. */
function deferredFetcher() {
  const pending = new Map<
    string,
    { resolve: (value: string) => void; reject: (err: Error) => void }
  >();
  const calls: string[] = [];

  const fetcher = (key: string) =>
    new Promise<string>((resolve, reject) => {
      calls.push(key);
      pending.set(key, { resolve, reject });
    });

  return {
    fetcher,
    calls,
    resolve: (key: string, value: string) => pending.get(key)?.resolve(value),
    reject: (key: string, message: string) =>
      pending.get(key)?.reject(new Error(message)),
  };
}

/** Let the store's awaited continuations run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("KeyedFetchStore", () => {
  it("fetches a key once and exposes its data", async () => {
    const { fetcher, calls, resolve } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    expect(store.getSnapshot().get("42")).toEqual({
      data: null,
      loading: true,
      error: null,
    });

    resolve("42", "payload");
    await flush();

    expect(store.getSnapshot().get("42")).toEqual({
      data: "payload",
      loading: false,
      error: null,
    });
    expect(calls).toEqual(["42"]);
  });

  it("ignores a repeat request while the first is in flight", () => {
    const { fetcher, calls } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    store.request("42");
    store.request("42");

    expect(calls).toEqual(["42"]);
  });

  it("ignores a repeat request for an already-loaded key", async () => {
    const { fetcher, calls, resolve } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    resolve("42", "payload");
    await flush();
    store.request("42");

    expect(calls).toEqual(["42"]);
  });

  it("records the failure and does not refetch a failed key (#250)", async () => {
    const { fetcher, calls, reject } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    reject("42", "network down");
    await flush();

    expect(store.getSnapshot().get("42")).toEqual({
      data: null,
      loading: false,
      error: "Error: network down",
    });

    // The unbounded-refetch bug: the failure itself changed the state that
    // re-entered the effect, and "cached or in flight" let the retry through.
    store.request("42");
    store.request("42");
    expect(calls).toEqual(["42"]);
  });

  it("refetches a failed key only on an explicit retry", async () => {
    const { fetcher, calls, reject, resolve } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    reject("42", "network down");
    await flush();

    store.retry("42");
    expect(calls).toEqual(["42", "42"]);
    expect(store.getSnapshot().get("42")?.loading).toBe(true);
    expect(store.getSnapshot().get("42")?.error).toBeNull();

    resolve("42", "payload");
    await flush();
    expect(store.getSnapshot().get("42")?.data).toBe("payload");
  });

  it("ignores a retry while a fetch is already in flight", () => {
    const { fetcher, calls } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("42");
    store.retry("42");

    expect(calls).toEqual(["42"]);
  });

  it("keeps keys independent", async () => {
    const { fetcher, reject, resolve } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);

    store.request("1");
    store.request("2");
    resolve("1", "one");
    reject("2", "gone");
    await flush();

    expect(store.getSnapshot().get("1")?.data).toBe("one");
    expect(store.getSnapshot().get("2")?.error).toBe("Error: gone");
  });

  it("notifies subscribers and hands out a fresh snapshot each change", async () => {
    const { fetcher, resolve } = deferredFetcher();
    const store = new KeyedFetchStore(fetcher);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const initial = store.getSnapshot();
    store.request("42");
    const loadingSnapshot = store.getSnapshot();
    resolve("42", "payload");
    await flush();

    expect(listener).toHaveBeenCalledTimes(2);
    // Identity must change per update, or useSyncExternalStore never re-renders.
    expect(loadingSnapshot).not.toBe(initial);
    expect(store.getSnapshot()).not.toBe(loadingSnapshot);

    unsubscribe();
    store.retry("42");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
