import { type OverlayPoint, type RunSummary } from "../types";
import { mockRuns } from "./runs";

function generateOverlayPoints(
  distanceKm: number,
  baseCadence: number,
  basePace: number,
  count: number,
): OverlayPoint[] {
  const points: OverlayPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const frac = i / (count - 1);
    // Add some realistic variation
    const cadenceNoise = Math.sin(frac * 12) * 4 + Math.cos(frac * 7) * 2;
    const paceNoise = Math.sin(frac * 8) * 0.3 + Math.cos(frac * 5) * 0.15;
    points.push({
      distance: frac * distanceKm,
      time: frac * distanceKm * basePace,
      cadence: Math.round(baseCadence + cadenceNoise),
      pace: Math.round((basePace + paceNoise) * 100) / 100,
    });
  }
  return points;
}

const run10003 = mockRuns.find((r) => r.id === 10003)!;
const run10013 = mockRuns.find((r) => r.id === 10013)!;

/** Pre-built stream cache for 2 runs: Tempo Intervals (10003) and Intervals 5x1k (10013) */
export const mockStreamCache = new Map<
  number,
  { run: RunSummary; points: OverlayPoint[] }
>([
  [
    10003,
    {
      run: run10003,
      points: generateOverlayPoints(run10003.distance, 172, 4.5, 50),
    },
  ],
  [
    10013,
    {
      run: run10013,
      points: generateOverlayPoints(run10013.distance, 178, 4.0, 50),
    },
  ],
]);
