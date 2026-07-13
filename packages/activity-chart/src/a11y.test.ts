import { describe, expect, it } from "vitest";
import { buildChartA11yDescription, buildChartA11yTitle } from "./a11y";
import { type ActivityMeta, type ChartDataPoint } from "./types";

const runMeta: ActivityMeta = {
  name: "Tempo Tuesday",
  activityType: "Run",
  isRunning: true,
  isSwimming: false,
};

const rideMeta: ActivityMeta = {
  name: "Hill Repeats",
  activityType: "Ride",
  isRunning: false,
  isSwimming: false,
};

const swimMeta: ActivityMeta = {
  name: "Pool Intervals",
  activityType: "Swim",
  isRunning: false,
  isSwimming: true,
};

const runData: ChartDataPoint[] = [
  {
    time: 0,
    timeFormatted: "00:00",
    heartrate: 120,
    pace: 6.05,
    altitude: 12,
    grade: -1.25,
  },
  {
    time: 900,
    timeFormatted: "15:00",
    heartrate: 176,
    pace: 4.2,
    altitude: 96,
    grade: 4.5,
  },
  { time: 1800, timeFormatted: "30:00", heartrate: 150, pace: 5.0 },
];

describe("buildChartA11yTitle", () => {
  it("names the activity and its type", () => {
    expect(buildChartA11yTitle(runMeta)).toBe(
      'Chart of Run activity "Tempo Tuesday"',
    );
  });
});

describe("buildChartA11yDescription", () => {
  it("narrates extent and each visible series range with units", () => {
    const desc = buildChartA11yDescription({
      meta: runMeta,
      data: runData,
      visibleMetrics: ["heartrate", "pace", "altitude"],
      lapCount: 3,
      smoothed: false,
    });
    expect(desc).toBe(
      "Chart over 30:00, by time. " +
        "Heart rate ranges from 120 to 176 bpm. " +
        "Pace ranges between 4'12\" and 6'03\" min/km. " +
        "Altitude ranges from 12 to 96 m. " +
        "3 laps shaded as bands.",
    );
  });

  it("skips hidden series and notes smoothing", () => {
    const desc = buildChartA11yDescription({
      meta: runMeta,
      data: runData,
      visibleMetrics: ["heartrate"],
      smoothed: true,
    });
    expect(desc).toContain("Heart rate ranges from 120 to 176 bpm.");
    expect(desc).not.toContain("Pace");
    expect(desc).toContain("Values are smoothed.");
  });

  it("describes pace as speed in km/h for rides", () => {
    const desc = buildChartA11yDescription({
      meta: rideMeta,
      data: [
        { time: 0, timeFormatted: "00:00", pace: 22.4, grade: 0 },
        { time: 600, timeFormatted: "10:00", pace: 41.8, grade: 8.2 },
      ],
      visibleMetrics: ["pace", "grade"],
    });
    expect(desc).toContain("Speed ranges from 22.4 to 41.8 km/h.");
    expect(desc).toContain("Grade ranges from 0.0% to 8.2%.");
  });

  it("uses the distance extent for swims", () => {
    const desc = buildChartA11yDescription({
      meta: swimMeta,
      data: [
        { time: 0, timeFormatted: "00:00", distance: 0, pace: 2.1 },
        { time: 1500, timeFormatted: "25:00", distance: 1500, pace: 1.8 },
      ],
      visibleMetrics: ["pace"],
    });
    expect(desc).toContain("Chart over 1500 m, by distance.");
    expect(desc).toContain("Pace ranges between 1'48\" and 2'06\" per 100 m.");
  });

  it("says so when every series is toggled off", () => {
    const desc = buildChartA11yDescription({
      meta: runMeta,
      data: runData,
      visibleMetrics: [],
    });
    expect(desc).toContain("No metrics are currently shown.");
  });
});
