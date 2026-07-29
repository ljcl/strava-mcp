/**
 * Bounded-concurrency scheduling for the scan-style tools.
 *
 * `get-best-efforts` (#239) was the first tool to need this: one Strava
 * request per activity, so a serial loop over the default 100 activities
 * spent 100 sequential round-trips, while an unbounded `Promise.all` would
 * spike the 15-minute quota faster than the fetch layer's backoff can react.
 *
 * It lives here rather than inside that tool (#300) because
 * `get-race-prediction` and `find-segments-on-route` want exactly the same
 * shape, and AGENTS.md records what a copied helper costs: #216 fixed a
 * pace-rollover bug in one of two duplicated formatters and left the other
 * wrong. Neither knip nor Biome can see a genuinely-imported duplicate.
 *
 * The helper stays a pure scheduling primitive — it knows nothing about
 * Strava. Rate-limit policy (what counts as fatal, what to report) belongs to
 * the calling tool, which injects it via `shouldStop`.
 */

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, stopping
 * early once `shouldStop` reports true.
 *
 * Returns the results of the items that actually completed, **in input
 * order** — an early stop leaves a shorter array, not a reordered or sparse
 * one, so a caller can compare `results.length` against `items.length` to
 * report how many it missed.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  shouldStop: () => boolean = () => false,
): Promise<R[]> {
  // Boxed so an unstarted slot stays distinguishable from a worker that
  // legitimately resolved to `undefined`.
  const slots = new Array<{ value: R } | undefined>(items.length);
  let next = 0;

  const runners = Array.from(
    { length: Math.max(0, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        if (shouldStop()) return;
        const index = next++;
        const item = items[index];
        if (item === undefined) return;
        slots[index] = { value: await worker(item) };
      }
    },
  );

  await Promise.all(runners);

  const results: R[] = [];
  for (const slot of slots) {
    if (slot !== undefined) results.push(slot.value);
  }
  return results;
}
