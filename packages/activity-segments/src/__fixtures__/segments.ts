import { type ActivitySegmentsData, type SegmentEffortRow } from "../types";

/**
 * Deterministic segment-effort fixtures for stories, tests, and local dev.
 * Values are hand-tuned to be realistic (no Math.random): varied distances,
 * paces, a couple of PRs, one KOM/top-10, climbs with real grades, and a few
 * efforts with HR / cadence / power streams.
 */

function effort(
  over: Partial<SegmentEffortRow> & {
    name: string;
    segmentId: string;
    distanceMeters: number;
    elapsedTime: number;
    startIndex: number;
  },
): SegmentEffortRow {
  return {
    movingTime: over.elapsedTime,
    averageGrade: 0,
    maximumGrade: 0,
    climbCategory: null,
    prRank: null,
    komRank: null,
    averageHeartrate: null,
    maxHeartrate: null,
    averageWatts: null,
    deviceWatts: null,
    averageCadence: null,
    ...over,
  };
}

const runEfforts: SegmentEffortRow[] = [
  effort({
    name: "Riverside Sprint",
    segmentId: "1001",
    distanceMeters: 100,
    elapsedTime: 16,
    movingTime: 16,
    averageGrade: -0.4,
    maximumGrade: 1.2,
    prRank: 1,
    averageHeartrate: 168,
    maxHeartrate: 176,
    averageCadence: 92,
    startIndex: 40,
  }),
  effort({
    name: "Mill Lane Straight",
    segmentId: "1002",
    distanceMeters: 420,
    elapsedTime: 88,
    movingTime: 86,
    averageGrade: 0.6,
    maximumGrade: 2.1,
    averageHeartrate: 162,
    maxHeartrate: 170,
    averageCadence: 89,
    startIndex: 150,
  }),
  effort({
    name: "Beacon Hill Climb",
    segmentId: "1003",
    distanceMeters: 640,
    elapsedTime: 198,
    movingTime: 196,
    averageGrade: 7.8,
    maximumGrade: 12.4,
    climbCategory: 3,
    komRank: 8,
    averageHeartrate: 178,
    maxHeartrate: 188,
    averageCadence: 84,
    startIndex: 300,
  }),
  effort({
    name: "Canal Towpath",
    segmentId: "1004",
    distanceMeters: 1200,
    elapsedTime: 312,
    movingTime: 308,
    averageGrade: 0.1,
    maximumGrade: 1.0,
    averageHeartrate: 160,
    maxHeartrate: 167,
    averageCadence: 88,
    startIndex: 520,
  }),
  effort({
    name: "Old Bridge Descent",
    segmentId: "1005",
    distanceMeters: 300,
    elapsedTime: 58,
    movingTime: 58,
    averageGrade: -4.2,
    maximumGrade: -6.8,
    prRank: 2,
    averageHeartrate: 156,
    maxHeartrate: 164,
    averageCadence: 95,
    startIndex: 700,
  }),
  effort({
    name: "Heath Loop",
    segmentId: "1006",
    distanceMeters: 2100,
    elapsedTime: 540,
    movingTime: 532,
    averageGrade: 1.4,
    maximumGrade: 5.5,
    averageHeartrate: 165,
    maxHeartrate: 174,
    averageCadence: 87,
    startIndex: 820,
  }),
  effort({
    name: "Station Road Tempo",
    segmentId: "1007",
    distanceMeters: 800,
    elapsedTime: 186,
    movingTime: 184,
    averageGrade: -0.8,
    maximumGrade: 1.6,
    deviceWatts: true,
    averageWatts: 312,
    averageHeartrate: 170,
    maxHeartrate: 179,
    averageCadence: 90,
    startIndex: 1100,
  }),
  effort({
    name: "Park Gate Rise",
    segmentId: "1008",
    distanceMeters: 480,
    elapsedTime: 134,
    movingTime: 132,
    averageGrade: 4.9,
    maximumGrade: 8.1,
    climbCategory: 4,
    averageHeartrate: 174,
    maxHeartrate: 183,
    averageCadence: 85,
    startIndex: 1320,
  }),
  effort({
    name: "Long Meadow Mile",
    segmentId: "1009",
    distanceMeters: 1609,
    elapsedTime: 396,
    movingTime: 392,
    averageGrade: 0.2,
    maximumGrade: 2.4,
    deviceWatts: true,
    averageWatts: 298,
    averageHeartrate: 168,
    maxHeartrate: 176,
    averageCadence: 88,
    startIndex: 1500,
  }),
  effort({
    name: "Forest Track North",
    segmentId: "1010",
    distanceMeters: 3000,
    elapsedTime: 822,
    movingTime: 812,
    averageGrade: 1.1,
    maximumGrade: 6.2,
    averageHeartrate: 163,
    maxHeartrate: 175,
    averageCadence: 86,
    startIndex: 1800,
  }),
  effort({
    name: "Quarry Steps",
    segmentId: "1011",
    distanceMeters: 220,
    elapsedTime: 74,
    movingTime: 73,
    averageGrade: 9.4,
    maximumGrade: 15.7,
    climbCategory: 4,
    startIndex: 2100,
  }),
  effort({
    name: "Finish Straight",
    segmentId: "1012",
    distanceMeters: 250,
    elapsedTime: 44,
    movingTime: 44,
    averageGrade: -0.3,
    maximumGrade: 0.9,
    averageHeartrate: 175,
    maxHeartrate: 184,
    averageCadence: 96,
    startIndex: 2300,
  }),
];

export const defaultActivity: ActivitySegmentsData = {
  id: "14872003001",
  name: "Saturday Long Run",
  activityType: "Run",
  startDateLocal: "2026-06-20T07:42:00Z",
  segments: runEfforts,
};

/** Same shape as defaultActivity, but no efforts carry a PR or KOM rank. */
export const noHighlights: ActivitySegmentsData = {
  id: "14872003002",
  name: "Easy Recovery Run",
  activityType: "Run",
  startDateLocal: "2026-06-19T18:05:00Z",
  segments: runEfforts.map((e) => ({ ...e, prRank: null, komRank: null })),
};

/** An activity that matched no segments. */
export const noSegments: ActivitySegmentsData = {
  id: "14872003003",
  name: "Treadmill Session",
  activityType: "Run",
  startDateLocal: "2026-06-18T06:30:00Z",
  segments: [],
};
