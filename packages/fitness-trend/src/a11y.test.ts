import { describe, expect, it } from "vitest";
import {
  mockFitnessTrendData,
  mockRestProjectionData,
} from "./__fixtures__/trend";
import { buildTrendA11y } from "./a11y";

describe("buildTrendA11y", () => {
  it("names the window, today's values, and the shaded periods", () => {
    const { title, desc } = buildTrendA11y(mockFitnessTrendData);
    const current = mockFitnessTrendData.current!;

    expect(title).toBe("Fitness, fatigue, and form");
    expect(desc).toContain("90 days from 31 Mar 2026 to 28 Jun 2026.");
    expect(desc).toContain(`Fitness (CTL) ${current.ctl}`);
    expect(desc).toContain(`form (TSB) -${Math.abs(current.tsb)}`);
    expect(desc).toContain(
      `${mockFitnessTrendData.bands.length} shaded periods`,
    );
    expect(desc).toContain("deep fatigue from");
  });

  it("describes the taper continuation and where it lands", () => {
    const desc = buildTrendA11y(mockFitnessTrendData).desc;
    const taper = mockFitnessTrendData.taper!;
    expect(desc).toContain(`dashed ${taper.days.length}-day taper plan`);
    expect(desc).toContain("landing on form +12");
  });

  it("calls a rest projection what it is", () => {
    const desc = buildTrendA11y(mockRestProjectionData).desc;
    expect(desc).toContain("rest projection");
    expect(desc).not.toContain("taper plan");
  });

  it("reports the direction of the last week of fitness", () => {
    expect(buildTrendA11y(mockFitnessTrendData).desc).toMatch(
      /Fitness (rose|fell|held level)/,
    );
  });

  it("skips the direction clause on a series shorter than a week", () => {
    const desc = buildTrendA11y({
      ...mockFitnessTrendData,
      series: mockFitnessTrendData.series.slice(-3),
    }).desc;
    expect(desc).not.toContain("over the last 7 days");
  });

  it("says so when nothing is shaded", () => {
    const desc = buildTrendA11y({ ...mockFitnessTrendData, bands: [] }).desc;
    expect(desc).toContain("No periods are shaded");
  });

  it("drops hidden series, the hidden plan, and hidden band kinds (#328)", () => {
    const desc = buildTrendA11y(mockFitnessTrendData, {
      showCtl: false,
      showAtl: true,
      showTsb: false,
      showPlan: false,
      hiddenBandKinds: [],
    }).desc;
    expect(desc).not.toContain("Fitness (CTL)");
    expect(desc).not.toContain("form (TSB)");
    expect(desc).not.toContain("over the last 7 days");
    expect(desc).not.toContain("taper plan");
    expect(desc).toContain("Fatigue (ATL)");
  });

  it("narrates only the band kinds still shaded", () => {
    const kinds = [
      ...new Set(mockFitnessTrendData.bands.map((band) => band.kind)),
    ];
    const allHidden = buildTrendA11y(mockFitnessTrendData, {
      showCtl: true,
      showAtl: true,
      showTsb: true,
      showPlan: true,
      hiddenBandKinds: kinds,
    }).desc;
    expect(allHidden).toContain("No periods are shaded");
    expect(allHidden).not.toContain("shaded period");
  });

  it("degrades to a plain sentence with no days", () => {
    expect(buildTrendA11y({ ...mockFitnessTrendData, series: [] })).toEqual({
      title: "Fitness, fatigue, and form",
      desc: "No days to display.",
    });
  });
});
