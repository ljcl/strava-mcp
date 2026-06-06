import { describe, expect, it } from "vitest";
import { basicRoute, routeWithNullOptionals } from "./__fixtures__";
import {
  formatDistance,
  formatDuration,
  formatDurationHuman,
  formatElevation,
  formatRouteSummary,
  formatSpeed,
} from "./formatters";
import { RouteSchema } from "./stravaClient";

// Raw route fixtures use numeric ids; parse them so the formatter receives the
// normalised (string-id) shape it gets in production.
const parseRoute = (raw: unknown) => RouteSchema.parse(raw);

describe("formatDuration", () => {
  it("formats seconds to HH:MM:SS with hours", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("formats seconds to MM:SS without hours", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("pads single digit values", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("returns N/A for null", () => {
    expect(formatDuration(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatDuration(undefined)).toBe("N/A");
  });

  it("returns N/A for negative values", () => {
    expect(formatDuration(-10)).toBe("N/A");
  });

  it("returns N/A for NaN", () => {
    expect(formatDuration(NaN)).toBe("N/A");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0:00");
  });
});

describe("formatDurationHuman", () => {
  it("formats hours and minutes", () => {
    expect(formatDurationHuman(5400)).toBe("1h 30m");
  });

  it("formats minutes and seconds", () => {
    expect(formatDurationHuman(125)).toBe("2m 5s");
  });

  it("formats seconds only", () => {
    expect(formatDurationHuman(45)).toBe("45s");
  });

  it("handles exact hour", () => {
    expect(formatDurationHuman(3600)).toBe("1h 0m");
  });

  it("handles exact minute", () => {
    expect(formatDurationHuman(60)).toBe("1m 0s");
  });
});

describe("formatDistance", () => {
  it("converts meters to km with 2 decimal places", () => {
    expect(formatDistance(5250)).toBe("5.25 km");
  });

  it("handles large distances", () => {
    expect(formatDistance(42195)).toBe("42.20 km");
  });

  it("returns N/A for null", () => {
    expect(formatDistance(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatDistance(undefined)).toBe("N/A");
  });
});

describe("formatElevation", () => {
  it("rounds meters to integer", () => {
    expect(formatElevation(150.7)).toBe("151 m");
  });

  it("handles small values", () => {
    expect(formatElevation(5.2)).toBe("5 m");
  });

  it("returns N/A for null", () => {
    expect(formatElevation(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatElevation(undefined)).toBe("N/A");
  });
});

describe("formatSpeed", () => {
  it("converts m/s to km/h with 1 decimal place", () => {
    expect(formatSpeed(5)).toBe("18.0 km/h");
  });

  it("handles typical running speed", () => {
    expect(formatSpeed(3.33)).toBe("12.0 km/h");
  });

  it("returns N/A for null", () => {
    expect(formatSpeed(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatSpeed(undefined)).toBe("N/A");
  });
});

describe("formatRouteSummary", () => {
  it("formats route with all fields", () => {
    const result = formatRouteSummary(parseRoute(basicRoute));
    expect(result).toContain("Sunday Long Ride");
    expect(result).toContain("50.00 km");
    expect(result).toContain("500 m");
    expect(result).toContain("Ride");
  });

  it("handles null description", () => {
    const result = formatRouteSummary(parseRoute(routeWithNullOptionals));
    expect(result).not.toContain("Description:");
  });

  it("truncates long descriptions", () => {
    const longDescRoute = {
      ...basicRoute,
      description: "A".repeat(150),
    };
    const result = formatRouteSummary(parseRoute(longDescRoute));
    expect(result).toContain("...");
  });
});
