import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeRateLimit,
  FetchClient,
  HttpError,
  parseJsonWithLargeInts,
  parseRateLimitHeaders,
  RateLimitError,
  stravaCacheTtl,
} from "./fetchClient";

describe("HttpError", () => {
  it("creates error with correct message", () => {
    const error = new HttpError("HTTP 404: Not Found", {
      status: 404,
      statusText: "Not Found",
      data: "Resource not found",
    });

    expect(error.message).toBe("HTTP 404: Not Found");
  });

  it("has correct name property", () => {
    const error = new HttpError("Test error", {
      status: 500,
      statusText: "Internal Server Error",
      data: "Server error",
    });

    expect(error.name).toBe("HttpError");
  });

  it("stores response data correctly", () => {
    const error = new HttpError("HTTP 401: Unauthorized", {
      status: 401,
      statusText: "Unauthorized",
      data: '{"error": "Invalid token"}',
    });

    expect(error.response.status).toBe(401);
    expect(error.response.statusText).toBe("Unauthorized");
    expect(error.response.data).toBe('{"error": "Invalid token"}');
  });

  it("is an instance of Error", () => {
    const error = new HttpError("Test", {
      status: 400,
      statusText: "Bad Request",
      data: "",
    });

    expect(error).toBeInstanceOf(Error);
  });

  it("is an instance of HttpError", () => {
    const error = new HttpError("Test", {
      status: 400,
      statusText: "Bad Request",
      data: "",
    });

    expect(error).toBeInstanceOf(HttpError);
  });

  it("can be caught as Error", () => {
    const throwHttpError = () => {
      throw new HttpError("Test error", {
        status: 500,
        statusText: "Internal Server Error",
        data: "",
      });
    };

    expect(throwHttpError).toThrow(Error);
  });

  it("preserves stack trace", () => {
    const error = new HttpError("Test", {
      status: 400,
      statusText: "Bad Request",
      data: "",
    });

    expect(error.stack).toBeDefined();
  });
});

describe("parseJsonWithLargeInts", () => {
  it("preserves integers beyond MAX_SAFE_INTEGER as exact strings", () => {
    // A real-world Strava segment-effort id, well past 2^53 - 1.
    const big = "3503400000123456789";
    const out = parseJsonWithLargeInts(`{"id":${big}}`) as { id: unknown };
    expect(out.id).toBe(big);
  });

  it("leaves safe integers as numbers", () => {
    const out = parseJsonWithLargeInts('{"id":18685903457}') as { id: unknown };
    expect(out.id).toBe(18685903457);
    expect(typeof out.id).toBe("number");
  });

  it("does not touch floats or non-integer numbers", () => {
    const out = parseJsonWithLargeInts('{"distance":5000.5,"grade":-1.2}') as {
      distance: unknown;
      grade: unknown;
    };
    expect(out.distance).toBe(5000.5);
    expect(out.grade).toBe(-1.2);
  });

  it("preserves oversized ids nested in arrays", () => {
    const out = parseJsonWithLargeInts(
      '{"segment_efforts":[{"id":3503400000123456789},{"id":42}]}',
    ) as { segment_efforts: Array<{ id: unknown }> };
    expect(out.segment_efforts[0]?.id).toBe("3503400000123456789");
    expect(out.segment_efforts[1]?.id).toBe(42);
  });

  it("preserves negative oversized integers", () => {
    const out = parseJsonWithLargeInts('{"id":-9007199254740993}') as {
      id: unknown;
    };
    expect(out.id).toBe("-9007199254740993");
  });
});

describe("parseRateLimitHeaders", () => {
  it("parses overall and read windows plus retry-after", () => {
    const headers = new Headers({
      "x-ratelimit-limit": "100,1000",
      "x-ratelimit-usage": "42,512",
      "x-readratelimit-limit": "100,1000",
      "x-readratelimit-usage": "30,400",
      "retry-after": "120",
    });

    const snapshot = parseRateLimitHeaders(headers);

    expect(snapshot.shortTerm).toEqual({ limit: 100, usage: 42 });
    expect(snapshot.daily).toEqual({ limit: 1000, usage: 512 });
    expect(snapshot.readShortTerm).toEqual({ limit: 100, usage: 30 });
    expect(snapshot.readDaily).toEqual({ limit: 1000, usage: 400 });
    expect(snapshot.retryAfterSeconds).toBe(120);
    expect(typeof snapshot.observedAt).toBe("number");
  });

  it("leaves windows undefined when headers are absent", () => {
    const snapshot = parseRateLimitHeaders(new Headers());
    expect(snapshot.shortTerm).toBeUndefined();
    expect(snapshot.daily).toBeUndefined();
    expect(snapshot.retryAfterSeconds).toBeUndefined();
  });
});

describe("describeRateLimit", () => {
  it("reports the exhausted 15-minute window with a reset time", () => {
    const message = describeRateLimit({
      shortTerm: { limit: 100, usage: 100 },
      daily: { limit: 1000, usage: 500 },
      observedAt: Date.now(),
    });

    expect(message).toContain("15-minute rate limit reached");
    expect(message).toContain("100/100");
    expect(message).toContain("Resets at");
  });

  it("prefers the daily window when it is the exhausted one", () => {
    const message = describeRateLimit({
      shortTerm: { limit: 100, usage: 10 },
      daily: { limit: 1000, usage: 1000 },
      observedAt: Date.now(),
    });

    expect(message).toContain("Daily rate limit reached");
    expect(message).toContain("1000/1000");
  });
});

function makeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe("FetchClient retry and rate-limit behaviour", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // No real waiting; tiny base delay keeps jitter math harmless.
  const newClient = () =>
    new FetchClient("https://example.test", {
      maxRetries: 2,
      baseDelayMs: 1,
      sleep: async () => {},
    });

  it("captures rate-limit headers after a successful request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse('{"ok":true}', {
        headers: {
          "x-ratelimit-limit": "100,1000",
          "x-ratelimit-usage": "10,200",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    await client.get("/thing");

    const snapshot = client.getRateLimitSnapshot();
    expect(snapshot?.shortTerm).toEqual({ limit: 100, usage: 10 });
    expect(snapshot?.daily).toEqual({ limit: 1000, usage: 200 });
  });

  it("honours Retry-After on a 429 and retries to success", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse("rate limited", {
          status: 429,
          headers: {
            "retry-after": "2",
            "x-ratelimit-limit": "100,1000",
            "x-ratelimit-usage": "100,500",
          },
        }),
      )
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FetchClient("https://example.test", {
      maxRetries: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const result = await client.get<{ ok: boolean }>("/thing");

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Waited exactly the Retry-After window (2s) before retrying.
    expect(sleeps).toEqual([2000]);
  });

  it("throws a structured RateLimitError once retries are exhausted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      makeResponse("rate limited", {
        status: 429,
        headers: {
          "retry-after": "1",
          "x-ratelimit-limit": "100,1000",
          "x-ratelimit-usage": "100,500",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();

    await expect(client.get("/thing")).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfterSeconds: 1,
    });
    // Initial attempt + 2 retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const err = await client.get("/thing").catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.message).toContain("15-minute rate limit reached");
    expect(err.rateLimit.shortTerm).toEqual({ limit: 100, usage: 100 });
  });

  it("does not wait out a Retry-After that exceeds the cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse("rate limited", {
        status: 429,
        headers: { "retry-after": "900" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FetchClient("https://example.test", {
      maxRetries: 2,
      maxRetryAfterMs: 15000,
      sleep: async () => {},
    });

    await expect(client.get("/thing")).rejects.toBeInstanceOf(RateLimitError);
    // 900s far exceeds the 15s cap, so no retry is attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient 5xx errors on GET and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse("boom", { status: 503 }))
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    const result = await client.get<{ ok: boolean }>("/thing");

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network faults on GET and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    const result = await client.get<{ ok: boolean }>("/thing");

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a transient error after exhausting retries", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();

    await expect(client.get("/thing")).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry writes on a transient 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();

    await expect(client.put("/thing", { a: 1 })).rejects.toBeInstanceOf(
      HttpError,
    );
    // No retry for a PUT — a single attempt only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry writes on a 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse("rate limited", {
        status: 429,
        headers: { "retry-after": "1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();

    await expect(client.post("/thing", { a: 1 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-transient 4xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();

    await expect(client.get("/thing")).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("stravaCacheTtl policy", () => {
  it("caches activity streams the longest (immutable)", () => {
    expect(stravaCacheTtl("/activities/123/streams/time,heartrate")).toBe(
      6 * 60 * 60_000,
    );
  });

  it("caches detailed activity for an hour", () => {
    expect(stravaCacheTtl("/activities/123")).toBe(60 * 60_000);
  });

  it("caches profile and stats briefly", () => {
    expect(stravaCacheTtl("/athlete")).toBe(5 * 60_000);
    expect(stravaCacheTtl("/athletes/999/stats")).toBe(5 * 60_000);
  });

  it("does not cache list, segment, or sub-resource endpoints", () => {
    expect(stravaCacheTtl("/athlete/activities")).toBeNull();
    expect(stravaCacheTtl("/athlete/clubs")).toBeNull();
    expect(stravaCacheTtl("/activities/123/zones")).toBeNull();
    expect(stravaCacheTtl("/activities/123/laps")).toBeNull();
    expect(stravaCacheTtl("/segments/55")).toBeNull();
    expect(stravaCacheTtl("/routes/77")).toBeNull();
  });
});

describe("FetchClient response cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A cacheable path + an uncacheable one, plus an injectable clock for expiry.
  const newCachingClient = (now: () => number = () => 0) =>
    new FetchClient("https://example.test", {
      maxRetries: 0,
      sleep: async () => {},
      cache: {
        ttlForPath: (path) => (path.startsWith("/activities/") ? 1000 : null),
        now,
      },
    });

  it("serves a repeat cacheable GET from cache (hit) without re-fetching", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"id":1,"name":"first"}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    const a = await client.get<{ name: string }>("/activities/1");
    const b = await client.get<{ name: string }>("/activities/1");

    expect(a.data.name).toBe("first");
    expect(b.data.name).toBe("first");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache paths the policy declines (miss every time)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    await client.get("/athlete/activities");
    await client.get("/athlete/activities");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("distinguishes cache entries by query string", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    await client.get("/activities/1/streams/heartrate");
    await client.get("/activities/1/streams/heartrate");
    await client.get("/activities/1/streams/watts");

    // Two distinct URLs => two fetches; the repeat of the first is cached.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches once the TTL has expired", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    let time = 0;
    const client = newCachingClient(() => time);
    await client.get("/activities/1");
    time = 1000; // reach the TTL boundary
    await client.get("/activities/1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skipCache bypasses both reading and writing the cache", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    // Warm the cache, then a skipCache read must still hit the network...
    await client.get("/activities/1");
    await client.get("/activities/1", { skipCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached reads under a written resource path", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    // Cache the detail and a sub-resource stream.
    await client.get("/activities/1");
    await client.get("/activities/1/streams/heartrate");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A write to the activity drops both cached reads.
    await client.put("/activities/1", { name: "renamed" });

    await client.get("/activities/1");
    await client.get("/activities/1/streams/heartrate");
    // 2 initial + 1 write + 2 re-fetches after invalidation.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not invalidate sibling resources on a write (path boundary)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    await client.get("/activities/12"); // sibling of /activities/1
    await client.put("/activities/1", { name: "x" });
    await client.get("/activities/12"); // still cached

    // 1 initial GET + 1 write; the second GET is a cache hit (no extra fetch).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clearResponseCache() forces the next read to re-fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const client = newCachingClient();
    await client.get("/activities/1");
    client.clearResponseCache();
    await client.get("/activities/1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
