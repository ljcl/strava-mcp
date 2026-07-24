import { describe, expect, it } from "vitest";
import {
  emptySegmentProgressData,
  mockSegmentProgressData,
  sparseSegmentProgressData,
} from "./__fixtures__/efforts";
import { buildSegmentProgressContextSummary } from "./contextSummary";

describe("buildSegmentProgressContextSummary", () => {
  it("summarises the history, the best, and both trends", () => {
    const summary = buildSegmentProgressContextSummary(mockSegmentProgressData);

    expect(summary).toContain(
      "Segment progress for Bradleys Head Rd Climb: 8 efforts from 14 Sep 25 to 26 Apr 26.",
    );
    expect(summary).toContain(
      "Best 4:04 on 29 Mar 26, latest 4:09 (+5s vs best).",
    );
    expect(summary).toContain(
      "Recent half vs early half: -13s average time, -8 bpm average heart rate.",
    );
  });

  it("names the effort the user opened in the list", () => {
    const summary = buildSegmentProgressContextSummary(
      mockSegmentProgressData,
      mockSegmentProgressData.efforts[6]!.id,
    );

    expect(summary).toContain(
      "Effort open in the list: 29 Mar 26, 4:04 from activity 140006.",
    );
  });

  it("ignores a selection that is not in the history", () => {
    const summary = buildSegmentProgressContextSummary(
      mockSegmentProgressData,
      "not-an-effort",
    );

    expect(summary).not.toContain("Effort open in the list");
  });

  it("omits the trend sentence for a sparse history", () => {
    const summary = buildSegmentProgressContextSummary(
      sparseSegmentProgressData,
    );

    expect(summary).toContain("3 efforts");
    expect(summary).not.toContain("Recent half");
  });

  it("says so when the range holds no efforts", () => {
    expect(
      buildSegmentProgressContextSummary(emptySegmentProgressData),
    ).toContain("no efforts in the selected range");
  });

  it("returns null for an unnamed segment", () => {
    expect(
      buildSegmentProgressContextSummary({
        ...mockSegmentProgressData,
        segment: { ...mockSegmentProgressData.segment, name: "" },
      }),
    ).toBeNull();
  });
});
