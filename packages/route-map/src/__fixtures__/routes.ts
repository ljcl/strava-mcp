import { type RouteMapData } from "../types";

/** A loopy activity track (start and finish near each other). */
const loopCoordinates: Array<[number, number]> = [
  [37.7694, -122.5107],
  [37.7705, -122.505],
  [37.7712, -122.499],
  [37.7719, -122.493],
  [37.7724, -122.487],
  [37.7728, -122.481],
  [37.7731, -122.475],
  [37.7726, -122.469],
  [37.771, -122.466],
  [37.7688, -122.4665],
  [37.7672, -122.47],
  [37.7665, -122.476],
  [37.7662, -122.482],
  [37.766, -122.488],
  [37.7659, -122.494],
  [37.7661, -122.5],
  [37.7668, -122.5055],
  [37.768, -122.5095],
  [37.7692, -122.5106],
];

export const loopActivity: RouteMapData = {
  source: "activity",
  id: "1234567890",
  name: "Golden Gate Park Loop",
  activityType: "Run",
  distance: 8230,
  elevationGain: 96,
  coordinates: loopCoordinates,
  start: loopCoordinates[0]!,
  end: loopCoordinates[loopCoordinates.length - 1]!,
};

/** A point-to-point saved route that climbs to the north-east. */
const pointToPointCoordinates: Array<[number, number]> = [
  [37.8088, -122.4098],
  [37.8101, -122.4075],
  [37.8119, -122.4061],
  [37.8142, -122.4058],
  [37.8167, -122.4051],
  [37.819, -122.4032],
  [37.8208, -122.4005],
  [37.8221, -122.397],
  [37.8236, -122.3938],
  [37.8258, -122.3919],
  [37.8284, -122.3908],
  [37.8312, -122.3901],
];

export const pointToPointRoute: RouteMapData = {
  source: "route",
  id: "9988776655",
  name: "Embarcadero to North Point",
  activityType: "Ride",
  distance: 12540,
  elevationGain: 231,
  coordinates: pointToPointCoordinates,
  start: pointToPointCoordinates[0]!,
  end: pointToPointCoordinates[pointToPointCoordinates.length - 1]!,
};

/**
 * The loop densified to GPS-stream resolution, with deterministic synthetic
 * metric streams aligned to each point, to exercise metric coloring, the
 * hover scrub, and the elevation strip.
 */
const POINTS_PER_LEG = 8;

const streamCoordinates: Array<[number, number]> = loopCoordinates.flatMap(
  ([lat, lng], i) => {
    const next = loopCoordinates[i + 1];
    if (!next) return [[lat, lng] as [number, number]];
    return Array.from({ length: POINTS_PER_LEG }, (_, j) => {
      const t = j / POINTS_PER_LEG;
      return [lat + (next[0] - lat) * t, lng + (next[1] - lng) * t] as [
        number,
        number,
      ];
    });
  },
);

const n = streamCoordinates.length;
const SAMPLE_SECONDS = 5;

const velocity = Array.from(
  { length: n },
  (_, i) => 2.9 + 0.7 * Math.sin(i / 9) + 0.3 * Math.sin(i / 3.5),
);
const time = Array.from({ length: n }, (_, i) => i * SAMPLE_SECONDS);
const distance = velocity.reduce<number[]>((acc, v, i) => {
  acc.push((acc[i - 1] ?? 0) + v * SAMPLE_SECONDS);
  return acc;
}, []);
const altitude = Array.from(
  { length: n },
  (_, i) => 24 + 16 * Math.sin(i / 14) + 5 * Math.sin(i / 5),
);
const heartrate = Array.from(
  { length: n },
  (_, i) => 146 + 16 * Math.sin(i / 11 + 1) + 4 * Math.sin(i / 4),
);
const watts = Array.from(
  { length: n },
  (_, i) => 215 + 55 * Math.sin(i / 7) + 15 * Math.sin(i / 3),
);
const gradeSmooth = altitude.map((a, i) => {
  const prev = altitude[i - 1] ?? a;
  const run = velocity[i]! * SAMPLE_SECONDS;
  return Math.round(((a - prev) / run) * 1000) / 10;
});

export const streamLoopActivity: RouteMapData = {
  source: "activity",
  id: "1234567891",
  name: "Golden Gate Park Tempo",
  activityType: "Run",
  distance: distance[n - 1]!,
  elevationGain: 124,
  coordinates: streamCoordinates,
  start: streamCoordinates[0]!,
  end: streamCoordinates[n - 1]!,
  streams: {
    time,
    distance,
    altitude,
    heartrate,
    watts,
    velocity_smooth: velocity,
    grade_smooth: gradeSmooth,
  },
};

/**
 * The stream activity plus annotation anchors (laps, segment efforts, photos)
 * to exercise the overlay layers and their toggles.
 */
export const annotatedActivity: RouteMapData = {
  ...streamLoopActivity,
  id: "1234567892",
  name: "Golden Gate Park Race",
  annotations: {
    laps: [
      { lapIndex: 1, name: "Lap 1", endIndex: Math.floor(n / 3) },
      { lapIndex: 2, name: "Lap 2", endIndex: Math.floor((2 * n) / 3) },
    ],
    segments: [
      {
        name: "Conservatory Climb",
        startIndex: Math.floor(n * 0.1),
        endIndex: Math.floor(n * 0.28),
        isPr: true,
        isTop10: false,
      },
      {
        name: "Panhandle Sprint",
        startIndex: Math.floor(n * 0.45),
        endIndex: Math.floor(n * 0.58),
        isPr: false,
        isTop10: true,
      },
      {
        name: "Chain of Lakes",
        startIndex: Math.floor(n * 0.72),
        endIndex: Math.floor(n * 0.85),
        isPr: false,
        isTop10: false,
      },
    ],
    photos: [
      { index: Math.floor(n * 0.2), caption: "Conservatory of Flowers" },
      { index: Math.floor(n * 0.2), caption: null },
      { index: Math.floor(n * 0.62), caption: "Bison paddock" },
    ],
  },
};

/** An indoor activity with no GPS track, to exercise the empty state. */
export const noGeometryActivity: RouteMapData = {
  source: "activity",
  id: "5555555555",
  name: "Treadmill Intervals",
  activityType: "Run",
  distance: 6000,
  elevationGain: 0,
  coordinates: [],
  start: null,
  end: null,
};
