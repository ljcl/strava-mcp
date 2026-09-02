/**
 * Regression tests for #109: the OAuth callback validates a single-use
 * `state` nonce before exchanging any code (so a CSRF-ed callback cannot
 * overwrite the owner's tokens), and /auth/start + /auth/status are gated
 * behind MCP_AUTH_TOKEN when it is configured.
 *
 * And for #351: every string the auth pages reflect (the callback's
 * `error` query parameter, the exchange failure message) is entity-encoded
 * at the sink, so a crafted callback link cannot run script on this origin.
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

describe("reflected input is escaped (#351)", () => {
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
    vi.restoreAllMocks();
  });

  /** The text inside the error box's <p>, exactly as the browser sees it. */
  function errorBoxText(body: string): string {
    const match = body.match(/<div class="error-box">\s*<p>([\s\S]*?)<\/p>/);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  it("entity-encodes a <script> payload in the callback's ?error=", async () => {
    const payload = "<script>alert(1)</script>";
    const { url } = get(`/auth/callback?error=${encodeURIComponent(payload)}`);

    const response = await handleAuthCallback(url);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).not.toContain("<script>");
    expect(mockedExchange).not.toHaveBeenCalled();
  });

  it("entity-encodes the exchange failure message on the catch path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedExchange.mockRejectedValueOnce(
      new Error("<img src=x onerror=alert(1)>"),
    );
    const state = startAndExtractState();

    const { url } = get(`/auth/callback?code=good-code&state=${state}`);
    const response = await handleAuthCallback(url);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("&lt;img");
    expect(body).not.toContain("<img");
  });

  it("encodes quotes and ampersands, leaving none raw inside the <p>", async () => {
    const { url } = get(
      `/auth/callback?error=${encodeURIComponent("a\"b&c'd")}`,
    );

    const response = await handleAuthCallback(url);
    const text = errorBoxText(await response.text());

    expect(text).toBe("Authorization denied: a&quot;b&amp;c&#39;d");
  });

  it("keeps the unauthorized page's <code> markup while escaping its text", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";
    const { req, url } = get("/auth/start");

    const response = handleAuthStart(req, url);
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain(
      "<code>/auth/start?token=&lt;MCP_AUTH_TOKEN&gt;</code>",
    );
    expect(body).toContain("<code>Authorization: Bearer</code>");
    expect(body).not.toContain("<MCP_AUTH_TOKEN>");
  });

  it("still renders the athlete id on the success page", async () => {
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
    expect(await response.text()).toContain("(Athlete ID: <code>42</code>)");
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
