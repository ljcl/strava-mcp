/**
 * Regression tests for #129: /health reports auth and rate-limit state
 * without spending a Strava request, and the advertised version comes from
 * the root package.json that release-please bumps.
 */
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaApi } from "./fetchClient";
import { handleHealth } from "./health";
import { getTokenStatus } from "./tokenManager";
import { SERVER_VERSION } from "./version";

vi.mock("./tokenManager", () => ({
  getTokenStatus: vi.fn(),
}));

vi.mock("./fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchClient")>();
  return {
    ...actual,
    stravaApi: { getRateLimitSnapshot: vi.fn() },
  };
});

const mockedStatus = vi.mocked(getTokenStatus);
const mockedSnapshot = vi.mocked(stravaApi.getRateLimitSnapshot);

const get = (path = "/health", headers: Record<string, string> = {}) => {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url, { headers }), url };
};

describe("handleHealth", () => {
  beforeEach(() => {
    mockedStatus.mockReset();
    mockedSnapshot.mockReset();
    mockedStatus.mockResolvedValue({
      authenticated: true,
      expires_at: "2026-07-12T10:00:00.000Z",
      expires_in_minutes: 90,
      athlete_id: 42,
    });
    mockedSnapshot.mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.MCP_AUTH_TOKEN;
  });

  it("reports version, auth state, and rate-limit snapshot as JSON", async () => {
    mockedSnapshot.mockReturnValue({
      shortTerm: { usage: 42, limit: 100 },
      daily: { usage: 310, limit: 1000 },
      observedAt: 1_752_300_000_000,
    } as ReturnType<typeof stravaApi.getRateLimitSnapshot>);

    const { req, url } = get();
    const response = await handleHealth(req, url);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.version).toBe(SERVER_VERSION);
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(body.authenticated).toBe(true);
    expect(body.token_expires_at).toBe("2026-07-12T10:00:00.000Z");
    expect(body.rate_limit.shortTerm.usage).toBe(42);
    // athlete_id stays out of /health — it is gated behind /auth/status.
    expect(body.athlete_id).toBeUndefined();
  });

  it("advertises the release version from root package.json, not a hardcoded one", () => {
    const rootVersion = createRequire(import.meta.url)(
      "../../../package.json",
    ).version;

    expect(SERVER_VERSION).toBe(rootVersion);
    expect(SERVER_VERSION).not.toBe("1.0.0");
  });

  it("reports authenticated: false when no tokens are stored", async () => {
    mockedStatus.mockResolvedValue({
      authenticated: false,
      auth_url: "/auth/start",
    });

    const { req, url } = get();
    const body = await (await handleHealth(req, url)).json();

    expect(body.authenticated).toBe(false);
    expect(body.token_expires_at).toBeNull();
  });

  it("serves liveness only to unauthenticated callers when a secret is set", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    const { req, url } = get();
    const response = await handleHealth(req, url);
    const body = await response.json();

    // Docker HEALTHCHECK keeps working (200), but auth/rate detail is gone.
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.authenticated).toBeUndefined();
    expect(body.rate_limit).toBeUndefined();
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it("serves full detail with the secret presented", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    const { req, url } = get("/health", { authorization: "Bearer s3cret" });
    const body = await (await handleHealth(req, url)).json();

    expect(body.authenticated).toBe(true);
  });
});
