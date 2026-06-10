import { describe, expect, it } from "vitest";
import { runTileProbe } from "./tileProbe";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("runTileProbe", () => {
  it("reports success with the style name and layer count", async () => {
    const result = await runTileProbe(async () =>
      jsonResponse({ name: "OFM Liberty", layers: [{}, {}, {}] }),
    );
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('"OFM Liberty"');
    expect(result.detail).toContain("3 layers");
  });

  it("reports a non-OK status as reachable-but-failed", async () => {
    const result = await runTileProbe(async () => jsonResponse({}, 503));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("HTTP 503");
  });

  it("reports a thrown fetch error as blocked", async () => {
    const result = await runTileProbe(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("blocked: TypeError: Failed to fetch");
  });
});
