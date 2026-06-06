import { describe, expect, it } from "vitest";
import { buildChartContextSummary } from "./contextSummary";

describe("buildChartContextSummary", () => {
  it("returns null until the activity name and metrics are known", () => {
    expect(
      buildChartContextSummary({
        activityName: null,
        availableMetrics: [],
        hidden: new Set(),
        smooth: false,
      }),
    ).toBeNull();
  });

  it("lists shown and hidden metrics and smoothing state", () => {
    const text = buildChartContextSummary({
      activityName: "Tempo Run",
      availableMetrics: ["heartrate", "pace", "cadence"],
      hidden: new Set(["cadence"]),
      smooth: true,
    });
    expect(text).toBe(
      'Viewing activity "Tempo Run". Showing: heart rate, pace. Hidden: cadence. Smoothing: on.',
    );
  });
});
