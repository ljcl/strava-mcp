/**
 * Strava sends activity zone types beyond the documented
 * heartrate/power pair (a run carries a third set), and an enum on `type`
 * failed the whole parse — dropping the heart rate set with it. These run the
 * real client against the real schema with only `fetch` stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaApi } from "./fetchClient";
import { getActivityZones } from "./stravaClient";

const realFetch = globalThis.fetch;

/** Stubs `fetch` with one JSON body for every request. */
function stubFetch(body: unknown) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const heartRateSet = {
  type: "heartrate",
  sensor_based: true,
  distribution_buckets: [
    { min: 0, max: 115, time: 300 },
    { min: 115, max: -1, time: 1200 },
  ],
};

const paceSet = {
  type: "pace",
  sensor_based: false,
  distribution_buckets: [
    { min: 0, max: 3, time: 900 },
    { min: 3, max: -1, time: 600 },
  ],
};

beforeEach(() => {
  // The client is a module-level singleton with a shared cache.
  stravaApi.clearResponseCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("getActivityZones", () => {
  it("keeps every set when Strava sends an undocumented zone type", async () => {
    stubFetch([heartRateSet, paceSet]);

    const zones = await getActivityZones("token", "20278545872");

    expect(zones.map((zone) => zone.type)).toEqual(["heartrate", "pace"]);
    expect(zones[0]?.distribution_buckets).toHaveLength(2);
  });

  it("logs the undocumented zone types it passes through", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch([heartRateSet, paceSet]);

    await getActivityZones("token", "20278545872");

    const lines = logged.mock.calls.map((call) => String(call[0]));
    expect(
      lines.some(
        (line) =>
          line.includes("Undocumented activity zone type(s)") &&
          line.includes("pace"),
      ),
    ).toBe(true);
  });

  it("still rejects a response whose buckets are malformed", async () => {
    stubFetch([{ type: "heartrate", distribution_buckets: [{ min: 0 }] }]);

    await expect(getActivityZones("token", "1")).rejects.toThrow(
      /Invalid data format/,
    );
  });
});
