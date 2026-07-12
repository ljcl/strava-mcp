import { describe, expect, it } from "vitest";
import { formatDistance, formatPace, formatTime } from "./formatting";

describe("formatTime", () => {
  it("formats minutes and seconds under an hour", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("adds an hours segment at 3600s and beyond", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(36_000)).toBe("10:00:00");
  });

  it("truncates fractional seconds", () => {
    expect(formatTime(59.9)).toBe("00:59");
  });
});

describe("formatDistance", () => {
  it("rounds to whole metres", () => {
    expect(formatDistance(999.4)).toBe("999m");
    expect(formatDistance(999.5)).toBe("1000m");
  });
});

describe("formatPace", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatPace(5.5)).toBe(`5'30"`);
    expect(formatPace(4.05)).toBe(`4'03"`);
  });

  it("rolls 60 seconds over into the next minute", () => {
    // 4.9999 min → 4'60" without the rollover guard.
    expect(formatPace(4.9999)).toBe(`5'00"`);
  });
});
