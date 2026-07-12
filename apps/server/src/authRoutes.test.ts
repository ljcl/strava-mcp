/**
 * Regression tests for #109: the OAuth callback validates a single-use
 * `state` nonce before exchanging any code (so a CSRF-ed callback cannot
 * overwrite the owner's tokens), and /auth/start + /auth/status are gated
 * behind MCP_AUTH_TOKEN when it is configured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAuthCallback,
  handleAuthStart,
  handleAuthStatus,
} from "./authRoutes";
import { consumeOAuthState, createOAuthState } from "./oauthState";
import { exchangeCodeForTokens, getTokenStatus } from "./tokenManager";

vi.mock("./tokenManager", () => ({
  exchangeCodeForTokens: vi.fn(),
  getTokenStatus: vi.fn(),
}));

const mockedExchange = vi.mocked(exchangeCodeForTokens);
const mockedStatus = vi.mocked(getTokenStatus);

const get = (path: string, headers: Record<string, string> = {}) => {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url, { headers }), url };
};

/** Runs /auth/start and extracts the state it minted into the redirect. */
function startAndExtractState(): string {
  const { req, url } = get("/auth/start");
  const response = handleAuthStart(req, url);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "");
  const state = location.searchParams.get("state");
  expect(state).toBeTruthy();
  return state!;
}

describe("OAuth state validation", () => {
  beforeEach(() => {
    process.env.STRAVA_CLIENT_ID = "client-id";
    process.env.PUBLIC_URL = "https://example.test";
    mockedExchange.mockReset();
    mockedStatus.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.PUBLIC_URL;
    delete process.env.MCP_AUTH_TOKEN;
  });

  it("rejects a callback without a state and does not exchange the code", async () => {
    const { url } = get("/auth/callback?code=attacker-code");

    const response = await handleAuthCallback(url);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid or expired");
    expect(mockedExchange).not.toHaveBeenCalled();
  });

  it("rejects a callback with an unknown state", async () => {
    const { url } = get("/auth/callback?code=attacker-code&state=forged");

    const response = await handleAuthCallback(url);

    expect(response.status).toBe(400);
    expect(mockedExchange).not.toHaveBeenCalled();
  });

  it("exchanges the code when the callback presents the state minted by /auth/start", async () => {
    mockedExchange.mockResolvedValueOnce({
      access_token: "a",
      refresh_token: "r",
      expires_at: 0,
      athlete_id: 42,
    });
    const state = startAndExtractState();

    const { url } = get(`/auth/callback?code=good-code&state=${state}`);
    const response = await handleAuthCallback(url);

    expect(response.status).toBe(200);
    expect(mockedExchange).toHaveBeenCalledWith("good-code");
  });

  it("states are single-use: a replayed callback is rejected", async () => {
    mockedExchange.mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      expires_at: 0,
      athlete_id: 42,
    });
    const state = startAndExtractState();
    const { url } = get(`/auth/callback?code=good-code&state=${state}`);

    await handleAuthCallback(url);
    const replay = await handleAuthCallback(url);

    expect(replay.status).toBe(400);
    expect(mockedExchange).toHaveBeenCalledTimes(1);
  });
});

describe("auth route gating via MCP_AUTH_TOKEN", () => {
  beforeEach(() => {
    process.env.STRAVA_CLIENT_ID = "client-id";
    process.env.PUBLIC_URL = "https://example.test";
    process.env.MCP_AUTH_TOKEN = "s3cret";
    mockedExchange.mockReset();
    mockedStatus.mockReset();
    mockedStatus.mockResolvedValue({ authenticated: true });
  });

  afterEach(() => {
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.PUBLIC_URL;
    delete process.env.MCP_AUTH_TOKEN;
  });

  it("rejects /auth/start without the secret", () => {
    const { req, url } = get("/auth/start");

    expect(handleAuthStart(req, url).status).toBe(401);
  });

  it("allows /auth/start with ?token= (browser flow)", () => {
    const { req, url } = get("/auth/start?token=s3cret");

    expect(handleAuthStart(req, url).status).toBe(302);
  });

  it("rejects /auth/status without the secret", async () => {
    const { req, url } = get("/auth/status");

    const response = await handleAuthStatus(req, url);

    expect(response.status).toBe(401);
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it("allows /auth/status with a bearer header", async () => {
    const { req, url } = get("/auth/status", {
      authorization: "Bearer s3cret",
    });

    const response = await handleAuthStatus(req, url);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it("keeps /auth/start open when no secret is configured", () => {
    delete process.env.MCP_AUTH_TOKEN;
    const { req, url } = get("/auth/start");

    expect(handleAuthStart(req, url).status).toBe(302);
  });
});

describe("oauthState TTL", () => {
  it("expires states after their TTL", () => {
    const t0 = 1_000_000;
    const state = createOAuthState(t0);

    expect(consumeOAuthState(state, t0 + 11 * 60 * 1000)).toBe(false);
  });

  it("accepts states within their TTL", () => {
    const t0 = 1_000_000;
    const state = createOAuthState(t0);

    expect(consumeOAuthState(state, t0 + 5 * 60 * 1000)).toBe(true);
  });
});
