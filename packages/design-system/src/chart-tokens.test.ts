import { describe, expect, it } from "vitest";
import {
  GRID_DASHARRAY,
  getChartTokens,
  MOBILE_BREAKPOINT_PX,
} from "./chart-tokens";

describe("getChartTokens", () => {
  it("returns desktop defaults for desktop mode", () => {
    const t = getChartTokens("desktop");
    expect(t.axisFont).toBe(13);
    expect(t.strokeWidth).toBe(2);
    expect(t.secondaryStrokeWidth).toBe(1.5);
    expect(t.dotScale).toBe(1);
    expect(t.errorBarWidth).toBe(8);
    expect(t.labelFontSize).toBe(9);
    expect(t.legendSize).toBe("default");
  });

  it("returns mobile defaults for mobile mode", () => {
    const t = getChartTokens("mobile");
    expect(t.axisFont).toBe(14);
    expect(t.strokeWidth).toBe(2.25);
    expect(t.secondaryStrokeWidth).toBe(1.75);
    expect(t.dotScale).toBe(0.75);
    expect(t.errorBarWidth).toBe(6);
    expect(t.labelFontSize).toBe(10);
    expect(t.legendSize).toBe("touch");
  });
});

describe("chart constants", () => {
  it("exposes the grid dasharray", () => {
    expect(GRID_DASHARRAY).toBe("3 3");
  });

  it("exposes the mobile breakpoint in pixels", () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(640);
  });
});
