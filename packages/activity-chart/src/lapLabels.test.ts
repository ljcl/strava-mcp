import { describe, expect, it } from "vitest";
import { type LapLabelBand, selectLapLabels } from "./lapLabels";

/** Contiguous, evenly-spaced bands of a given width in axis units. */
function bands(names: string[], width: number): LapLabelBand[] {
  return names.map((name, i) => ({
    name,
    start: i * width,
    end: (i + 1) * width,
  }));
}

describe("selectLapLabels", () => {
  it("labels every band when there is room for the text", () => {
    // 4 wide bands across a wide plot: each 500px band dwarfs its ~48px label.
    const b = bands(["Warmup", "Tempo", "Cruise", "Cooldown"], 500);
    expect(selectLapLabels(b, 0, 2000, 2000)).toEqual([true, true, true, true]);
  });

  it("drops labels that would stack on top of each other", () => {
    // 6 narrow contiguous bands on a small plot: labels can't all fit, so the
    // dense run collapses to a subset instead of an unreadable smear.
    const b = bands(
      ["Tempo 3k", "Warmup", "Tempo 2k", "Rest", "Tempo 1k", "Jog"],
      10,
    );
    const flags = selectLapLabels(b, 0, 60, 300);
    // First always wins; not all six can render.
    expect(flags[0]).toBe(true);
    expect(flags.filter(Boolean).length).toBeLessThan(b.length);
  });

  it("keeps the first label of a colliding run and hides its neighbour", () => {
    // Two touching bands, each only wide enough for one label's text.
    const b: LapLabelBand[] = [
      { name: "Tempo 2k", start: 0, end: 30 },
      { name: "Tempo 1k", start: 30, end: 60 },
    ];
    // Plot so narrow that "Tempo 2k" (~48px) overruns the 30-unit band.
    expect(selectLapLabels(b, 0, 60, 90)).toEqual([true, false]);
    // Widen the plot and both fit.
    expect(selectLapLabels(b, 0, 60, 600)).toEqual([true, true]);
  });

  it("ignores bands outside the visible (zoomed) window", () => {
    const b = bands(["A", "B", "C", "D"], 100);
    // Window only covers the third band (200–300).
    const flags = selectLapLabels(b, 210, 290, 400);
    expect(flags).toEqual([false, false, true, false]);
  });

  it("skips empty label names without consuming horizontal room", () => {
    const b: LapLabelBand[] = [
      { name: "", start: 0, end: 10 },
      { name: "Real", start: 10, end: 500 },
    ];
    expect(selectLapLabels(b, 0, 500, 500)).toEqual([false, true]);
  });

  it("returns all-false for a degenerate axis or unmeasured plot", () => {
    const b = bands(["A", "B"], 100);
    expect(selectLapLabels(b, 0, 0, 500)).toEqual([false, false]);
    expect(selectLapLabels(b, 0, 200, 0)).toEqual([false, false]);
  });

  it("orders by start position regardless of input order", () => {
    // Same two touching, colliding bands supplied out of order.
    const b: LapLabelBand[] = [
      { name: "Tempo 1k", start: 30, end: 60 },
      { name: "Tempo 2k", start: 0, end: 30 },
    ];
    // The earlier band (index 1) wins; the later one (index 0) drops.
    expect(selectLapLabels(b, 0, 60, 90)).toEqual([false, true]);
  });
});
