import {
  type SegmentEffort,
  type SegmentProgressData,
  type SegmentSummary,
} from "../types";

export const mockSegment: SegmentSummary = {
  id: "8109834",
  name: "Bradleys Head Rd Climb",
  activityType: "Run",
  distanceMeters: 820,
  averageGrade: 5.4,
  maximumGrade: 11.2,
  elevationGain: 44,
  climbCategory: 3,
  city: "Mosman",
  state: "NSW",
  country: "Australia",
  starred: true,
};

interface EffortSpec {
  date: string;
  seconds: number;
  hr?: number;
  maxHr?: number;
  cadence?: number;
  prRank?: number;
  komRank?: number;
}

/**
 * Eight monthly efforts across a new-year boundary: times drift down while
 * heart rate drops faster, so the "same time, lower heart rate" read is
 * visible; the fastest effort carries a Strava PR and one mid-season effort
 * a top-10.
 */
const SPECS: EffortSpec[] = [
  {
    date: "2025-09-14T07:12:00Z",
    seconds: 268,
    hr: 174,
    maxHr: 181,
    cadence: 172,
  },
  {
    date: "2025-10-19T07:04:00Z",
    seconds: 262,
    hr: 173,
    maxHr: 180,
    cadence: 174,
  },
  {
    date: "2025-11-23T06:58:00Z",
    seconds: 264,
    hr: 171,
    maxHr: 179,
    cadence: 173,
  },
  {
    date: "2025-12-21T07:31:00Z",
    seconds: 255,
    hr: 172,
    maxHr: 182,
    cadence: 176,
  },
  {
    date: "2026-01-25T06:44:00Z",
    seconds: 251,
    hr: 168,
    maxHr: 178,
    cadence: 177,
    komRank: 9,
  },
  {
    date: "2026-02-22T07:02:00Z",
    seconds: 252,
    hr: 164,
    maxHr: 175,
    cadence: 178,
  },
  {
    date: "2026-03-29T06:51:00Z",
    seconds: 244,
    hr: 165,
    maxHr: 177,
    cadence: 179,
    prRank: 1,
  },
  {
    date: "2026-04-26T07:18:00Z",
    seconds: 249,
    hr: 161,
    maxHr: 174,
    cadence: 178,
  },
];

function buildEfforts(specs: EffortSpec[]): SegmentEffort[] {
  const ranks = new Map(
    [...specs]
      .sort((a, b) => a.seconds - b.seconds)
      .map((spec, index) => [spec.date, index + 1] as const),
  );
  return specs.map((spec, index) => ({
    id: `${9000 + index}`,
    activityId: `${140000 + index}`,
    date: spec.date,
    elapsedSeconds: spec.seconds,
    movingSeconds: spec.seconds - 1,
    distanceMeters: 820,
    paceSecondsPerKm: Math.round((spec.seconds / 0.82) * 10) / 10,
    averageHeartrate: spec.hr ?? null,
    maxHeartrate: spec.maxHr ?? null,
    averageWatts: null,
    deviceWatts: false,
    averageCadence: spec.cadence ?? null,
    prRank: spec.prRank ?? null,
    komRank: spec.komRank ?? null,
    rank: ranks.get(spec.date)!,
  }));
}

export const mockEfforts: SegmentEffort[] = buildEfforts(SPECS);

/** Three efforts, no heart rate — the sparse-history story and tests. */
export const sparseEfforts: SegmentEffort[] = buildEfforts([
  { date: "2026-02-01T07:00:00Z", seconds: 272 },
  { date: "2026-03-01T07:00:00Z", seconds: 265 },
  { date: "2026-04-01T07:00:00Z", seconds: 269 },
]);

export const mockSegmentProgressData: SegmentProgressData = {
  segment: mockSegment,
  efforts: mockEfforts,
  summary: {
    effortCount: 8,
    firstDate: "2025-09-14T07:12:00Z",
    lastDate: "2026-04-26T07:18:00Z",
    bestSeconds: 244,
    bestDate: "2026-03-29T06:51:00Z",
    latestSeconds: 249,
    latestDate: "2026-04-26T07:18:00Z",
    latestVsBestSeconds: 5,
    medianSeconds: 253.5,
    heartrateEffortCount: 8,
    early: {
      count: 4,
      avgSeconds: 262,
      avgHeartrate: 173,
      firstDate: "2025-09-14T07:12:00Z",
      lastDate: "2025-12-21T07:31:00Z",
    },
    recent: {
      count: 4,
      avgSeconds: 249,
      avgHeartrate: 165,
      firstDate: "2026-01-25T06:44:00Z",
      lastDate: "2026-04-26T07:18:00Z",
    },
    avgSecondsDelta: -13,
    avgHeartrateDelta: -8,
  },
};

export const sparseSegmentProgressData: SegmentProgressData = {
  segment: { ...mockSegment, climbCategory: null, city: null },
  efforts: sparseEfforts,
  summary: {
    effortCount: 3,
    firstDate: "2026-02-01T07:00:00Z",
    lastDate: "2026-04-01T07:00:00Z",
    bestSeconds: 265,
    bestDate: "2026-03-01T07:00:00Z",
    latestSeconds: 269,
    latestDate: "2026-04-01T07:00:00Z",
    latestVsBestSeconds: 4,
    medianSeconds: 269,
    heartrateEffortCount: 0,
    early: null,
    recent: null,
    avgSecondsDelta: null,
    avgHeartrateDelta: null,
  },
};

export const emptySegmentProgressData: SegmentProgressData = {
  segment: mockSegment,
  efforts: [],
  summary: {
    effortCount: 0,
    firstDate: null,
    lastDate: null,
    bestSeconds: null,
    bestDate: null,
    latestSeconds: null,
    latestDate: null,
    latestVsBestSeconds: null,
    medianSeconds: null,
    heartrateEffortCount: 0,
    early: null,
    recent: null,
    avgSecondsDelta: null,
    avgHeartrateDelta: null,
  },
};
