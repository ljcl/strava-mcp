import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    const items = [30, 1, 20, 2];

    const results = await mapWithConcurrency(items, 4, async (ms) => {
      await tick(ms);
      return ms;
    });

    // The 1ms and 2ms items settle first; the contract is input order.
    expect(results).toEqual([30, 1, 20, 2]);
  });

  it("never exceeds the concurrency cap", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(items, 5, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return i;
    });

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("processes every item when nothing stops it", async () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    const worker = vi.fn(async (i: number) => i * 2);

    const results = await mapWithConcurrency(items, 3, worker);

    expect(worker).toHaveBeenCalledTimes(7);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  it("stops early once shouldStop flips and returns only what completed", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let processed = 0;
    let stop = false;

    const results = await mapWithConcurrency(
      items,
      2,
      async (i) => {
        processed += 1;
        if (processed >= 5) stop = true;
        await tick();
        return i;
      },
      () => stop,
    );

    // Some in-flight workers finish after the flag flips, so the exact count
    // is a range — what matters is that the scan does not run to the end.
    expect(processed).toBeLessThan(items.length);
    expect(results.length).toBe(processed);
    // Still contiguous from the start of the input, still ordered.
    expect(results).toEqual(items.slice(0, results.length));
  });

  it("does nothing when shouldStop is already true", async () => {
    const worker = vi.fn(async (i: number) => i);

    const results = await mapWithConcurrency([1, 2, 3], 2, worker, () => true);

    expect(worker).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("handles an empty input and a concurrency above the item count", async () => {
    expect(await mapWithConcurrency([], 5, async (i) => i)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 99, async (i) => i * 3)).toEqual([
      3, 6,
    ]);
  });

  it("preserves results that resolve to undefined", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (i) =>
      i === 2 ? undefined : i,
    );

    expect(results).toEqual([1, undefined, 3]);
  });
});
