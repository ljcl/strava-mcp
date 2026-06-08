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
