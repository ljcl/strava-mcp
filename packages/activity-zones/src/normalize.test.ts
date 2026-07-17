import { describe, expect, it } from "vitest";
import { hrZoneSet, powerZoneSet } from "./__fixtures__/zones";
import {
  buildSummaryStats,
  buildZoneRows,
  dominantBucket,
  formatDurationShort,
  formatZoneRange,
  intensitySplit,
} from "./normalize";

describe("formatZoneRange", () => {
  it("formats bounded and open-ended ranges", () => {
    expect(formatZoneRange(hrZoneSet.buckets[0]!, "bpm")).toBe("0–120 bpm");
    expect(formatZoneRange(hrZoneSet.buckets[4]!, "bpm")).toBe("175+ bpm");
  });
});

describe("formatDurationShort", () => {
  it("uses minutes under an hour and h/mm above", () => {
    expect(formatDurationShort(180)).toBe("3m");
    expect(formatDurationShort(2700)).toBe("45m");
    expect(formatDurationShort(3900)).toBe("1h 05m");
  });
});

describe("buildZoneRows", () => {
  it("labels zones and converts seconds to minutes", () => {
    const rows = buildZoneRows(hrZoneSet);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      label: "Z1",
      range: "0–120 bpm",
      minutes: 10,
      seconds: 600,
      pct: 15,
    });
    expect(rows[1]!.minutes).toBe(30);
  });
});

describe("intensitySplit", () => {
  it("buckets zones into easy (1-2), moderate (3), hard (4+)", () => {
    const split = intensitySplit(hrZoneSet);
    expect(split.easyPct).toBe(60);
    expect(split.moderatePct).toBe(22.5);
    expect(split.hardPct).toBe(17.5);
  });

  it("counts every zone above 3 as hard for 6-zone power sets", () => {
    const split = intensitySplit(powerZoneSet);
    expect(split.hardPct).toBe(15);
    expect(split.easyPct + split.moderatePct + split.hardPct).toBeCloseTo(
      100,
      1,
    );
  });
});

describe("dominantBucket", () => {
  it("returns the bucket with the most time", () => {
    expect(dominantBucket(hrZoneSet).zone).toBe(2);
    expect(dominantBucket(powerZoneSet).zone).toBe(2);
  });
});

describe("buildSummaryStats", () => {
  it("summarises time, dominant zone, and the split", () => {
    const stats = buildSummaryStats(hrZoneSet);
    expect(stats.map((s) => s.label)).toEqual([
      "Time",
      "Mostly",
      "Easy Z1–2",
      "Hard Z4+",
    ]);
    expect(stats[0]!.value).toBe("1h 07m");
    expect(stats[1]!.value).toBe("Z2");
    expect(stats[2]!.value).toBe("60%");
  });
});
