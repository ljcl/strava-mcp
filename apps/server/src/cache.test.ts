import { describe, expect, it } from "vitest";
import { TtlLruCache } from "./cache";

/**
 * A controllable clock so TTL expiry is deterministic — no real timers, no
 * flakiness.
 */
function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("TtlLruCache", () => {
  it("returns a stored value within its TTL (hit)", () => {
    const cache = new TtlLruCache<string>();
    cache.set("a", "value-a", 1000);
    expect(cache.get("a")).toBe("value-a");
  });

  it("returns undefined for an unknown key (miss)", () => {
    const cache = new TtlLruCache<string>();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("expires entries once the TTL elapses and evicts them on access", () => {
    const clock = fakeClock();
    const cache = new TtlLruCache<string>({ now: clock.now });

    cache.set("a", "value-a", 1000);
    clock.advance(999);
    expect(cache.get("a")).toBe("value-a");

    clock.advance(1); // now exactly at expiry boundary
    expect(cache.get("a")).toBeUndefined();
    // The expired entry was dropped, not just hidden.
    expect(cache.size).toBe(0);
  });

  it("treats a non-positive TTL as a delete", () => {
    const cache = new TtlLruCache<string>();
    cache.set("a", "value-a", 1000);
    cache.set("a", "value-a", 0);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least-recently-used entry when over capacity", () => {
    const cache = new TtlLruCache<string>({ maxEntries: 2 });
    cache.set("a", "A", 1000);
    cache.set("b", "B", 1000);
    // Touch "a" so "b" becomes the LRU entry.
    expect(cache.get("a")).toBe("A");

    cache.set("c", "C", 1000); // exceeds capacity, evicts LRU ("b")

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A");
    expect(cache.get("c")).toBe("C");
    expect(cache.size).toBe(2);
  });

  it("re-inserting an existing key refreshes its recency, not the size", () => {
    const cache = new TtlLruCache<string>({ maxEntries: 2 });
    cache.set("a", "A", 1000);
    cache.set("b", "B", 1000);
    cache.set("a", "A2", 1000); // update "a" -> now MRU
    cache.set("c", "C", 1000); // evicts LRU ("b")

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A2");
    expect(cache.get("c")).toBe("C");
  });

  it("deletes a single key", () => {
    const cache = new TtlLruCache<string>();
    cache.set("a", "A", 1000);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
  });

  it("invalidates every key matching a predicate", () => {
    const cache = new TtlLruCache<string>();
    cache.set("/activities/1", "detail", 1000);
    cache.set("/activities/1/streams/x", "streams", 1000);
    cache.set("/activities/2", "other", 1000);

    const removed = cache.deleteMatching((key) =>
      key.startsWith("/activities/1"),
    );

    expect(removed).toBe(2);
    expect(cache.get("/activities/1")).toBeUndefined();
    expect(cache.get("/activities/1/streams/x")).toBeUndefined();
    expect(cache.get("/activities/2")).toBe("other");
  });

  it("clear() empties the cache", () => {
    const cache = new TtlLruCache<string>();
    cache.set("a", "A", 1000);
    cache.set("b", "B", 1000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
