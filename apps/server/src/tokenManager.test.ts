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

/** OAuth retry tunables that keep the 5xx backoff instant in tests. */
const instantRetries = { sleep: async () => {} };

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
  it("clears the response cache so a re-auth cannot serve the previous athlete", async () => {
    // The cache keys on the bare URL, and /athlete is athlete-scoped behind an
    // athlete-independent one. Without the clear, the athlete who just
    // authorized reads the previous athlete's profile — and the stats
    // get-athlete-stats resolves from that id — for the rest of the TTL.
    const fetchMock = mockFetchOnceJson({
      access_token: "acc",
      refresh_token: "ref",
      expires_at: 9_999_999_999,
      athlete: { id: 42 },
    });

    const { exchangeCodeForTokens } = await importTokenManager();
    const { stravaApi } = await import("./fetchClient");

    const read = () =>
      stravaApi.get("/athlete", { headers: { Authorization: "Bearer a" } });
    await read();
    await read();
    // Second read was served from the cache, so the athlete swap matters.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await exchangeCodeForTokens("auth-code-123");
    await read();

    // The OAuth POST, plus a genuine re-read rather than the cached athlete.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

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

describe("getStravaToken (proactive refresh)", () => {
  it("returns the stored token without refreshing when comfortably valid", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "good-acc",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    const fetchMock = mockFetchOnceJson({});
    const { getStravaToken } = await importTokenManager();

    expect(await getStravaToken()).toBe("good-acc");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes inside the expiry buffer rather than waiting for a 401", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "stale-acc",
        refresh_token: "ref",
        // Inside the 5-minute buffer but not yet expired: the old code would
        // have spent a 401 discovering this on the first call after rollover.
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }),
    );

    const fetchMock = mockFetchOnceJson({
      access_token: "fresh-acc",
      refresh_token: "ref2",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
    });

    const { getStravaToken } = await importTokenManager();

    expect(await getStravaToken()).toBe("fresh-acc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves later calls from memory without re-reading the token file", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "good-acc",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    const { getStravaToken } = await importTokenManager();
    expect(await getStravaToken()).toBe("good-acc");

    // Removing the file must not change the answer: the second call is served
    // from the in-memory copy, so a tool call costs no filesystem read.
    fs.rmSync(tokenFile);
    expect(await getStravaToken()).toBe("good-acc");
  });

  it("throws NoTokenError when nothing is stored or in the environment", async () => {
    const fetchMock = mockFetchOnceJson({});
    const { getStravaToken, NoTokenError } = await importTokenManager();

    const failure = await getStravaToken().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(NoTokenError);
    expect((failure as Error).message).toContain("/auth/start");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates TokenRevokedError so the caller can point at re-auth", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "dead-acc",
        refresh_token: "dead-ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    mockFetchOnceJson({ error: "invalid_grant" }, 400);

    const { getStravaToken, TokenRevokedError } = await importTokenManager();

    const failure = await getStravaToken().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TokenRevokedError);
    expect((failure as Error).message).toContain("/auth/start");
  });

  it("forces a refresh for env-var tokens, whose expiry is unknown", async () => {
    process.env.STRAVA_ACCESS_TOKEN = "env-acc";
    process.env.STRAVA_REFRESH_TOKEN = "env-ref";

    const fetchMock = mockFetchOnceJson({
      access_token: "fresh-acc",
      refresh_token: "ref2",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
    });

    const { getStravaToken } = await importTokenManager();

    expect(await getStravaToken()).toBe("fresh-acc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getTokenStatus", () => {
  /** A comfortably valid token set, 30 minutes out. */
  const storedTokens = () => ({
    access_token: "acc",
    refresh_token: "ref",
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    athlete_id: 7,
  });

  /** Counts the stderr line loadTokens emits each time it reads tokens.json. */
  const countLoadedLines = (errorSpy: { mock: { calls: unknown[][] } }) =>
    errorSpy.mock.calls.filter(([line]) =>
      String(line).includes("Loaded tokens from"),
    ).length;

  it("reports unauthenticated when no tokens exist", async () => {
    const { getTokenStatus } = await importTokenManager();
    const status = await getTokenStatus();

    expect(status.authenticated).toBe(false);
    expect(status.auth_url).toBe("/auth/start");
  });

  it("reports authenticated with expiry details from the stored token", async () => {
    const tokens = storedTokens();
    fs.writeFileSync(tokenFile, JSON.stringify(tokens));

    const { getTokenStatus } = await importTokenManager();
    const status = await getTokenStatus();

    expect(status.authenticated).toBe(true);
    expect(status.athlete_id).toBe(7);
    expect(status.expires_at).toBe(
      new Date(tokens.expires_at * 1000).toISOString(),
    );
    expect(status.expires_in_minutes).toBeGreaterThanOrEqual(29);
    expect(status.expires_in_minutes).toBeLessThanOrEqual(30);
  });

  it("serves repeated polls from memory: one disk read, one 'Loaded tokens' line", async () => {
    fs.writeFileSync(tokenFile, JSON.stringify(storedTokens()));
    const readSpy = vi.spyOn(fsp, "readFile");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getTokenStatus } = await importTokenManager();

    // Nothing is cached yet, so the first poll must hit disk. This also proves
    // the spy intercepts the module's readFile before the counts below mean
    // anything.
    expect((await getTokenStatus()).authenticated).toBe(true);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(countLoadedLines(errorSpy)).toBe(1);

    // /health backs the container HEALTHCHECK and operator dashboards, so it
    // is polled continuously. Each poll used to re-read tokens.json and re-log
    // the load, burying the real telemetry lines in docker compose logs.
    expect((await getTokenStatus()).authenticated).toBe(true);
    expect((await getTokenStatus()).authenticated).toBe(true);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(countLoadedLines(errorSpy)).toBe(1);
  });

  it("reports tokens written by saveTokens without touching disk", async () => {
    const readSpy = vi.spyOn(fsp, "readFile");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { saveTokens, getTokenStatus } = await importTokenManager();
    const tokens = storedTokens();
    await saveTokens(tokens);
    const status = await getTokenStatus();

    // Both OAuth exchanges land in saveTokens, which primes the cache, so the
    // status right after an authorization is served from memory.
    expect(status.authenticated).toBe(true);
    expect(status.athlete_id).toBe(7);
    expect(status.expires_at).toBe(
      new Date(tokens.expires_at * 1000).toISOString(),
    );
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("reflects a refresh that rotated the in-memory tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "stale-acc",
        refresh_token: "ref",
        expires_at: now - 10,
        athlete_id: 7,
      }),
    );
    const rotatedExpiry = now + 21600;
    mockFetchOnceJson({
      access_token: "fresh-acc",
      refresh_token: "ref2",
      expires_at: rotatedExpiry,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getStravaToken, getTokenStatus } = await importTokenManager();
    expect(await getStravaToken()).toBe("fresh-acc");

    // The status is the token set tool calls actually send: the refresh
    // rotated the in-memory copy and the poll reads that, not the file.
    const readSpy = vi.spyOn(fsp, "readFile");
    const status = await getTokenStatus();
    expect(status.expires_at).toBe(
      new Date(rotatedExpiry * 1000).toISOString(),
    );
    expect(status.athlete_id).toBe(7);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("does not see a tokens.json replaced by hand once a copy is cached", async () => {
    fs.writeFileSync(tokenFile, JSON.stringify(storedTokens()));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getTokenStatus } = await importTokenManager();
    expect((await getTokenStatus()).athlete_id).toBe(7);

    // The documented trade-off (docs/operations.md, "Health check"): tool
    // calls do not pick up a hand-replaced file until restart either, so the
    // status agrees with them rather than with the file.
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({ ...storedTokens(), athlete_id: 8 }),
    );
    expect((await getTokenStatus()).athlete_id).toBe(7);
  });

  it("never caches 'no tokens': unauthenticated polls consult disk each time", async () => {
    const readSpy = vi.spyOn(fsp, "readFile");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getTokenStatus } = await importTokenManager();
    expect((await getTokenStatus()).authenticated).toBe(false);
    expect((await getTokenStatus()).authenticated).toBe(false);

    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  it("picks up a tokens.json written after an unauthenticated poll", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getTokenStatus } = await importTokenManager();
    expect((await getTokenStatus()).authenticated).toBe(false);

    // A fresh authorization (or a file restored from backup) becomes visible
    // on the next poll because "no tokens" was not cached.
    fs.writeFileSync(tokenFile, JSON.stringify(storedTokens()));
    const status = await getTokenStatus();
    expect(status.authenticated).toBe(true);
    expect(status.athlete_id).toBe(7);
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

    const fetchMock = mockFetchOnceJson(
      { message: "Internal Server Error" },
      500,
    );

    const { refreshAccessToken, TokenRevokedError } =
      await importTokenManager();

    const failure = await refreshAccessToken(instantRetries).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TokenRevokedError);
    expect((failure as Error).message).toMatch(/HTTP 500/);
    // Initial POST plus the two 5xx retries, then it gives up.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The refresh token may still be good — keep it for the next attempt.
    expect(fs.existsSync(tokenFile)).toBe(true);
    const kept = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    expect(kept.refresh_token).toBe("ref");
  });

  it("survives a single transient 5xx during refresh", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "acc",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Bad Gateway" }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "acc2",
            refresh_token: "ref2",
            expires_at: Math.floor(Date.now() / 1000) + 21600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { refreshAccessToken } = await importTokenManager();
    const tokens = await refreshAccessToken(instantRetries);

    expect(tokens.access_token).toBe("acc2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not resend the refresh token after a timeout", async () => {
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({
        access_token: "acc",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation timed out.", "TimeoutError"),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { refreshAccessToken } = await importTokenManager();
    const failure = await refreshAccessToken(instantRetries).catch(
      (e: unknown) => e,
    );

    expect((failure as Error).message).toMatch(/timed out/);
    // Strava may have rotated the refresh token before the deadline, so a
    // second POST would send an already-invalidated token. One attempt only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("carries the timeout signal on the OAuth exchange", async () => {
    const fetchMock = mockFetchOnceJson({
      access_token: "acc",
      refresh_token: "ref",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
    });

    const { exchangeCodeForTokens } = await importTokenManager();
    await exchangeCodeForTokens("code-123", instantRetries);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.signal).toBeInstanceOf(AbortSignal);
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
