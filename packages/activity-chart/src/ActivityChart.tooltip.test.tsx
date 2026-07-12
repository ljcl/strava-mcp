/**
 * Regression for #134: the tooltip filtered on falsy values, so legitimate
 * zero readings (0 W coasting, 0% grade, cadence 0) vanished while their
 * lines still rendered.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartTooltip } from "./ActivityChart";
import { type ActivityMeta } from "./types";

const rideMeta: ActivityMeta = {
  name: "Coasting Ride",
  activityType: "Ride",
  isRunning: false,
  isSwimming: false,
};

// A coasting moment: freewheeling downhill on flat-average terrain.
const coastingPayload = [
  { name: "Heart Rate", value: 141, color: "#e11" },
  { name: "Power", value: 0, color: "#1e1" },
  { name: "Grade", value: 0, color: "#11e" },
  { name: "Cadence", value: 0, color: "#ee1" },
];

describe("ChartTooltip", () => {
  it("keeps legitimate zero values visible", () => {
    const markup = renderToStaticMarkup(
      <ChartTooltip
        active
        payload={coastingPayload}
        label={1200}
        meta={rideMeta}
      />,
    );

    expect(markup).toContain("W Power");
    expect(markup).toContain("% Grade");
    expect(markup).toContain("rpm Cadence");
    // All three zero entries render a 0.0 value.
    expect(markup.match(/>0\.0</g)).toHaveLength(3);
  });

  it("still drops entries with no reading at this point", () => {
    const markup = renderToStaticMarkup(
      <ChartTooltip
        active
        payload={[
          { name: "Heart Rate", value: 141, color: "#e11" },
          { name: "Power", value: null, color: "#1e1" },
        ]}
        label={1200}
        meta={rideMeta}
      />,
    );

    expect(markup).toContain("bpm Heart Rate");
    expect(markup).not.toContain("Power");
  });

  it("renders nothing when every entry lacks a reading", () => {
    const markup = renderToStaticMarkup(
      <ChartTooltip
        active
        payload={[{ name: "Power", value: null, color: "#1e1" }]}
        label={0}
        meta={rideMeta}
      />,
    );

    expect(markup).toBe("");
  });

  it("shows the altitude entry (old Area-name guard removed)", () => {
    const markup = renderToStaticMarkup(
      <ChartTooltip
        active
        payload={[{ name: "Altitude", value: 12.4, color: "#aaa" }]}
        label={60}
        meta={rideMeta}
      />,
    );

    expect(markup).toContain("m Altitude");
    expect(markup).toContain(">12.4<");
  });
});
