/**
 * Apply a simple moving average to specified numeric keys.
 * Window shrinks at boundaries so no data is lost.
 * All non-smoothed fields are copied as-is.
 */
export function smooth<T extends object>(
  points: T[],
  numericKeys: readonly (keyof T & string)[],
  windowSize: number,
): T[] {
  const len = points.length;
  if (len < 3) return points;
  const half = Math.floor(windowSize / 2);

  return points.map((pt, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(len - 1, i + half);
    const smoothed = { ...pt };

    for (const key of numericKeys) {
      const val = pt[key] as number | undefined;
      if (val === undefined) {
        // biome-ignore lint/nursery/noContinue: guard clause in tight loop
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let j = lo; j <= hi; j += 1) {
        const v = points[j]![key] as number | undefined;
        if (v !== undefined) {
          sum += v;
          count += 1;
        }
      }
      // biome-ignore lint/suspicious/noExplicitAny: generic smoothing over dynamic keys
      (smoothed as any)[key] = count > 0 ? sum / count : val;
    }
    return smoothed;
  });
}
