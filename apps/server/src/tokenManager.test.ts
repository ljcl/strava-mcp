import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tokenManager reads TOKEN_DATA_DIR at module-load time (a top-level const), so
// each test sets the env var first and then dynamically imports the module after
// vi.resetModules(), forcing the token file path to point at a fresh temp dir.
// This keeps tests away from the real ./data/tokens.json on disk.

const realFetch = globalThis.fetch;

let tempDir: string;
let tokenFile: string;

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "TOKEN_DATA_DIR",
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_ACCESS_TOKEN",
  "STRAVA_REFRESH_TOKEN",
];

async function importTokenManager() {
  vi.resetModules();
  return import("./tokenManager");
}

function mockFetchOnceJson(body: unknown, status = 200) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
  tokenFile = path.join(tempDir, "tokens.json");

  process.env.TOKEN_DATA_DIR = tempDir;
  process.env.STRAVA_CLIENT_ID = "test-client";
  process.env.STRAVA_CLIENT_SECRET = "test-secret";
  // Ensure no ambient tokens leak into loadTokens() env fallback. (Assigning
  // undefined would coerce to the string "undefined", which is truthy, so delete.)
  delete process.env.STRAVA_ACCESS_TOKEN;
  delete process.env.STRAVA_REFRESH_TOKEN;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();

  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("exchangeCodeForTokens", () => {
  it("persists and returns tokens on a 200 response", async () => {
    const fetchMock = mockFetchOnceJson({
      access_token: "acc",
      refresh_token: "ref",
      expires_at: 9_999_999_999,
      athlete: { id: 42 },
    });

    const { exchangeCodeForTokens } = await importTokenManager();
    const tokens = await exchangeCodeForTokens("auth-code-123");

    expect(tokens).toEqual({
      access_token: "acc",
      refresh_token: "ref",
      expires_at: 9_999_999_999,
      athlete_id: 42,
    });

    // It POSTs to the Strava OAuth endpoint with the authorization_code grant.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://www.strava.com/oauth/token");
    const body = JSON.parse(init.body as string);
    expect(body.grant_type).toBe("authorization_code");
    expect(body.code).toBe("auth-code-123");

    // Tokens are persisted to tokens.json in the temp data dir.
    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written).toEqual({
      access_token: "acc",
      refresh_token: "ref",
      expires_at: 9_999_999_999,
      athlete_id: 42,
    });

    // process.env is updated for the rest of the app.
    expect(process.env.STRAVA_ACCESS_TOKEN).toBe("acc");
    expect(process.env.STRAVA_REFRESH_TOKEN).toBe("ref");
  });

  it("throws on a non-200 response and does not write a token file", async () => {
    mockFetchOnceJson({ message: "Bad Request" }, 400);

    const { exchangeCodeForTokens } = await importTokenManager();

    await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow(
      /OAuth token exchange failed: HTTP 400/,
    );

    expect(fs.existsSync(tokenFile)).toBe(false);
  });

  it("throws when client credentials are missing (no fetch made)", async () => {
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;

    const fetchMock = mockFetchOnceJson({});
    const { exchangeCodeForTokens } = await importTokenManager();

    await expect(exchangeCodeForTokens("code")).rejects.toThrow(
      /Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ensureValidToken (expiry-driven refresh)", () => {
  it("does NOT refresh when the stored token is comfortably valid", async () => {
    const future = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour out
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "valid-acc",
        refresh_token: "valid-ref",
        expires_at: future,
      }),
    );

    const fetchMock = mockFetchOnceJson({});
    const { ensureValidToken } = await importTokenManager();
    await ensureValidToken();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when the stored token is expired", async () => {
    const past = Math.floor(Date.now() / 1000) - 60 * 60; // expired 1 hour ago
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "old-acc",
        refresh_token: "old-ref",
        expires_at: past,
      }),
    );

    const fetchMock = mockFetchOnceJson({
      access_token: "new-acc",
      refresh_token: "new-ref",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    const { ensureValidToken } = await importTokenManager();
    await ensureValidToken();

    // A single refresh POST is made with the refresh_token grant.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://www.strava.com/oauth/token");
    const body = JSON.parse(init.body as string);
    expect(body.grant_type).toBe("refresh_token");
    expect(body.refresh_token).toBe("old-ref");

    // Refreshed tokens are persisted back to the file.
    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written.access_token).toBe("new-acc");
    expect(written.refresh_token).toBe("new-ref");
  });

  it("refreshes when token is within the expiry buffer (expires in <5 min)", async () => {
    const soon = Math.floor(Date.now() / 1000) + 60; // expires in 1 min, inside 5-min buffer
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "soon-acc",
        refresh_token: "soon-ref",
        expires_at: soon,
      }),
    );

    const fetchMock = mockFetchOnceJson({
      access_token: "fresh-acc",
      refresh_token: "fresh-ref",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    const { ensureValidToken } = await importTokenManager();
    await ensureValidToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw or fetch when no tokens are available", async () => {
    const fetchMock = mockFetchOnceJson({});
    const { ensureValidToken } = await importTokenManager();

    await expect(ensureValidToken()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTokenStatus", () => {
  it("reports unauthenticated when no tokens exist", async () => {
    const { getTokenStatus } = await importTokenManager();
    const status = await getTokenStatus();

    expect(status.authenticated).toBe(false);
    expect(status.auth_url).toBe("/auth/start");
  });

  it("reports authenticated with expiry details from the stored token", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min out
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "acc",
        refresh_token: "ref",
        expires_at: expiresAt,
        athlete_id: 7,
      }),
    );

    const { getTokenStatus } = await importTokenManager();
    const status = await getTokenStatus();

    expect(status.authenticated).toBe(true);
    expect(status.athlete_id).toBe(7);
    expect(status.expires_at).toBe(new Date(expiresAt * 1000).toISOString());
    expect(status.expires_in_minutes).toBeGreaterThanOrEqual(29);
    expect(status.expires_in_minutes).toBeLessThanOrEqual(30);
  });
});

describe("saveTokens", () => {
  it("creates the data dir and writes tokens.json", async () => {
    const { saveTokens } = await importTokenManager();
    await saveTokens({
      access_token: "a",
      refresh_token: "r",
      expires_at: 123,
      athlete_id: 1,
    });

    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written.access_token).toBe("a");
    expect(written.athlete_id).toBe(1);
  });

  it("writes atomically via a temp file + rename (no partial file on crash)", async () => {
    const writeSpy = vi.spyOn(fsp, "writeFile");
    const renameSpy = vi.spyOn(fsp, "rename");

    const { saveTokens } = await importTokenManager();
    await saveTokens({
      access_token: "a",
      refresh_token: "r",
      expires_at: 123,
      athlete_id: 1,
    });

    // The write targets a sibling .tmp file, then is renamed over the target.
    // rename is atomic on the same filesystem, so a crash mid-write can never
    // leave a half-written tokens.json behind.
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const [writtenPath] = writeSpy.mock.calls[0] as unknown as [string];
    expect(writtenPath).toBe(`${tokenFile}.tmp`);
    expect(renameSpy).toHaveBeenCalledWith(`${tokenFile}.tmp`, tokenFile);

    // The final file has the content and no temp file is left behind.
    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written.access_token).toBe("a");
    expect(fs.existsSync(`${tokenFile}.tmp`)).toBe(false);
  });
});

describe("refreshAccessToken (concurrency + token rotation)", () => {
  it("coalesces concurrent refreshes onto a single /oauth/token exchange", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "old-acc",
        refresh_token: "old-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
        athlete_id: 99,
      }),
    );

    // Gate the fetch so both callers are in-flight before it resolves. Without
    // coalescing, the second caller would POST the already-rotated refresh
    // token and Strava would reject it.
    let resolveFetch!: (r: Response) => void;
    const fetchGate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => fetchGate);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { refreshAccessToken } = await importTokenManager();

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();

    resolveFetch(
      new Response(
        JSON.stringify({
          access_token: "new-acc",
          refresh_token: "new-ref",
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const [t1, t2] = await Promise.all([p1, p2]);

    // Exactly one network exchange despite two concurrent callers.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(t1).toEqual(t2);
    expect(t1.access_token).toBe("new-acc");
    expect(t1.refresh_token).toBe("new-ref");

    // The rotated tokens are persisted once.
    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written.access_token).toBe("new-acc");
    expect(written.refresh_token).toBe("new-ref");
  });

  it("preserves athlete_id across a refresh that omits the athlete", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "old-acc",
        refresh_token: "old-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
        athlete_id: 4242,
      }),
    );

    // Strava's refresh_token grant response does not echo the athlete.
    mockFetchOnceJson({
      access_token: "new-acc",
      refresh_token: "new-ref",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    const { refreshAccessToken } = await importTokenManager();
    const tokens = await refreshAccessToken();

    expect(tokens.athlete_id).toBe(4242);
    const written = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(written.athlete_id).toBe(4242);
  });

  it("clears tokens and throws TokenRevokedError on Strava's revoked-token 400", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "dead-acc",
        refresh_token: "dead-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    // Strava's response to a revoked/deauthorized refresh token.
    const fetchMock = mockFetchOnceJson(
      {
        message: "Bad Request",
        errors: [
          {
            resource: "RefreshToken",
            field: "refresh_token",
            code: "invalid",
          },
        ],
      },
      400,
    );

    const { refreshAccessToken, TokenRevokedError } =
      await importTokenManager();

    await expect(refreshAccessToken()).rejects.toThrow(TokenRevokedError);
    await expect(refreshAccessToken()).rejects.toThrow(/\/auth\/start/);

    // Dead token state is cleared from disk and env, so nothing reloads it.
    expect(fs.existsSync(tokenFile)).toBe(false);
    expect(process.env.STRAVA_ACCESS_TOKEN).toBeUndefined();
    expect(process.env.STRAVA_REFRESH_TOKEN).toBeUndefined();

    // Only the first call reached Strava; the second found no tokens and did
    // not retry the doomed exchange.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("detects the generic OAuth invalid_grant response as a revocation", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "dead-acc",
        refresh_token: "dead-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    mockFetchOnceJson({ error: "invalid_grant" }, 400);

    const { refreshAccessToken, TokenRevokedError } =
      await importTokenManager();

    await expect(refreshAccessToken()).rejects.toThrow(TokenRevokedError);
    expect(fs.existsSync(tokenFile)).toBe(false);
  });

  it("treats transient failures as retryable: tokens are NOT cleared on a 500", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "acc",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    mockFetchOnceJson({ message: "Internal Server Error" }, 500);

    const { refreshAccessToken, TokenRevokedError } =
      await importTokenManager();

    const failure = await refreshAccessToken().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TokenRevokedError);
    expect((failure as Error).message).toMatch(/HTTP 500/);

    // The refresh token may still be good — keep it for the next attempt.
    expect(fs.existsSync(tokenFile)).toBe(true);
    const kept = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(kept.refresh_token).toBe("ref");
  });

  it("reports unauthenticated via getTokenStatus after a revocation", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "dead-acc",
        refresh_token: "dead-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    mockFetchOnceJson({ error: "invalid_grant" }, 400);

    const { refreshAccessToken, getTokenStatus } = await importTokenManager();
    await refreshAccessToken().catch(() => {});

    const status = await getTokenStatus();
    expect(status.authenticated).toBe(false);
    expect(status.auth_url).toBe("/auth/start");
  });

  it("does not crash ensureValidToken (startup) on a revoked token", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "dead-acc",
        refresh_token: "dead-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    mockFetchOnceJson({ error: "invalid_grant" }, 400);

    const { ensureValidToken } = await importTokenManager();

    // The server must still start so /auth/start can be used to re-authorize.
    await expect(ensureValidToken()).resolves.toBeUndefined();
    expect(fs.existsSync(tokenFile)).toBe(false);
  });

  it("clears the in-flight lock so a later refresh exchanges again", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "old-acc",
        refresh_token: "old-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "acc",
            refresh_token: "ref",
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { refreshAccessToken } = await importTokenManager();
    await refreshAccessToken();
    await refreshAccessToken();

    // Sequential refreshes are independent exchanges (lock resets between them).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
