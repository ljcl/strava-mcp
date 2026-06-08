import { describe, expect, it } from "vitest";
import { decodePolyline } from "./polyline";

describe("decodePolyline", () => {
  it("decodes the canonical Google example", () => {
    // The reference vector from the Google polyline algorithm docs.
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decoded).toHaveLength(3);

    const expected: Array<[number, number]> = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    decoded.forEach(([lat, lng], i) => {
      const target = expected[i]!;
      expect(lat).toBeCloseTo(target[0], 5);
      expect(lng).toBeCloseTo(target[1], 5);
    });
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("decodes a single coordinate", () => {
    // (38.5, -120.2) encodes to the first six characters of the example.
    const decoded = decodePolyline("_p~iF~ps|U");
    expect(decoded).toHaveLength(1);
    expect(decoded[0]![0]).toBeCloseTo(38.5, 5);
    expect(decoded[0]![1]).toBeCloseTo(-120.2, 5);
  });

  it("preserves running totals across many points", () => {
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    // Longitudes march steadily west, latitudes north — deltas accumulate.
    expect(decoded[2]![0]).toBeGreaterThan(decoded[0]![0]);
    expect(decoded[2]![1]).toBeLessThan(decoded[0]![1]);
  });
});
