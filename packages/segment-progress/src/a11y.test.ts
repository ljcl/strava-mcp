import { describe, expect, it } from "vitest";
import {
  emptySegmentProgressData,
  mockSegment,
  mockSegmentProgressData,
  sparseSegmentProgressData,
} from "./__fixtures__/efforts";
import { buildProgressA11y } from "./a11y";

describe("buildProgressA11y", () => {
  it("names the segment and the plotted range", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      mockSegmentProgressData.summary,
      true,
    );

    expect(a11y.title).toBe("Effort history on Bradleys Head Rd Climb");
    expect(a11y.desc).toContain("8 efforts on Bradleys Head Rd Climb");
    expect(a11y.desc).toContain("from 14 Sep 25 to 26 Apr 26");
    expect(a11y.desc).toContain("faster efforts higher");
  });

  it("states the personal best and the gap the latest effort sits at", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      mockSegmentProgressData.summary,
      true,
    );

    expect(a11y.desc).toContain("Personal best 4:04 on 29 Mar 26");
    expect(a11y.desc).toContain("most recent 4:09 on 26 Apr 26, +5s");
  });

  it("narrates the half-vs-half heart-rate drop when the overlay is shown", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      mockSegmentProgressData.summary,
      true,
    );

    expect(a11y.desc).toContain(
      "-13s average time compared with the early half",
    );
    expect(a11y.desc).toContain("average heart rate on 8 of the efforts");
    expect(a11y.desc).toContain("8 bpm lower in the recent half");
  });

  it("drops the heart-rate sentence when the overlay is hidden", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      mockSegmentProgressData.summary,
      false,
    );

    expect(a11y.desc).not.toContain("heart rate");
  });

  it("says the average time is unchanged rather than printing a zero delta", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      { ...mockSegmentProgressData.summary, avgSecondsDelta: 0 },
      false,
    );

    expect(a11y.desc).toContain("the same average time compared with");
  });

  it("omits the trend sentences for a sparse history", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      sparseSegmentProgressData.summary,
      true,
    );

    expect(a11y.desc).toContain("3 efforts");
    expect(a11y.desc).not.toContain("recent half");
    expect(a11y.desc).not.toContain("heart rate");
  });

  it("degrades to a plain sentence with no efforts", () => {
    const a11y = buildProgressA11y(
      mockSegment,
      emptySegmentProgressData.summary,
      true,
    );

    expect(a11y.desc).toBe("No efforts to display.");
  });
});
