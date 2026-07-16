import { TtlLruCache } from "./cache";

export class HttpError extends Error {
  response: {
    status: number;
    statusText: string;
    data: string;
  };

  constructor(
    message: string,
    response: { status: number; statusText: string; data: string },
  ) {
    super(message);
    this.name = "HttpError";
    this.response = response;
  }
}

/**
 * A single Strava rate-limit window: how many requests are allowed and how many
 * have been used. Strava reports two windows (15-minute and daily) for both the
 * overall and the read-only quotas.
 */
export interface RateLimitWindow {
  limit: number;
  usage: number;
}

/**
 * Snapshot of the rate-limit headers from the most recent Strava response.
 *
 * Strava returns comma-separated `X-RateLimit-Limit` / `X-RateLimit-Usage`
 * (overall) and `X-ReadRateLimit-Limit` / `X-ReadRateLimit-Usage` (read-only)
 * headers, each formatted `"<15-min>,<daily>"`. A `Retry-After` header may also
 * accompany a 429.
 */
export interface RateLimitSnapshot {
  shortTerm?: RateLimitWindow;
  daily?: RateLimitWindow;
  readShortTerm?: RateLimitWindow;
  readDaily?: RateLimitWindow;
  retryAfterSeconds?: number;
  /** `Date.now()` when this snapshot was captured. */
  observedAt: number;
}

/**
 * Thrown when Strava returns 429 and we have either exhausted our retries or the
 * window will not reset soon enough to be worth waiting on. Carries the parsed
 * rate-limit snapshot so callers can surface a structured, actionable message
 * (which window is exhausted, when it resets).
 */
export class RateLimitError extends HttpError {
  rateLimit: RateLimitSnapshot;
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    response: { status: number; statusText: string; data: string },
    rateLimit: RateLimitSnapshot,
    retryAfterSeconds: number | null,
  ) {
    super(message, response);
    this.name = "RateLimitError";
    this.rateLimit = rateLimit;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** HTTP statuses we treat as transient and retry on safe (GET) requests. */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Parses Strava's comma-separated `"<15-min>,<daily>"` header pair. */
function parsePair(
  limitHeader: string | null,
  usageHeader: string | null,
): { short?: RateLimitWindow; day?: RateLimitWindow } {
  if (!limitHeader || !usageHeader) return {};
  const limits = limitHeader.split(",").map((v) => Number(v.trim()));
  const usages = usageHeader.split(",").map((v) => Number(v.trim()));
  const result: { short?: RateLimitWindow; day?: RateLimitWindow } = {};
  if (Number.isFinite(limits[0]) && Number.isFinite(usages[0])) {
    result.short = { limit: limits[0] as number, usage: usages[0] as number };
  }
  if (Number.isFinite(limits[1]) && Number.isFinite(usages[1])) {
    result.day = { limit: limits[1] as number, usage: usages[1] as number };
  }
  return result;
}

/** Reads the rate-limit headers from a response into a snapshot. */
export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot {
  const overall = parsePair(
    headers.get("x-ratelimit-limit"),
    headers.get("x-ratelimit-usage"),
  );
  const read = parsePair(
    headers.get("x-readratelimit-limit"),
    headers.get("x-readratelimit-usage"),
  );
  const retryAfterRaw = headers.get("retry-after");
  const retryAfter =
    retryAfterRaw !== null && Number.isFinite(Number(retryAfterRaw))
      ? Number(retryAfterRaw)
      : undefined;

  return {
    shortTerm: overall.short,
    daily: overall.day,
    readShortTerm: read.short,
    readDaily: read.day,
    retryAfterSeconds: retryAfter,
    observedAt: Date.now(),
  };
}

/** Next quarter-hour boundary (UTC) — when Strava's 15-minute window resets. */
function next15MinReset(now: Date): Date {
  const reset = new Date(now);
  const nextQuarter = (Math.floor(now.getUTCMinutes() / 15) + 1) * 15;
  // setUTCMinutes overflows past 59 into the next hour, which is what we want.
  reset.setUTCMinutes(nextQuarter, 0, 0);
  return reset;
}

/** Next UTC midnight — when Strava's daily window resets. */
function nextDailyReset(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
}

/**
 * Builds a structured, actionable description of an exhausted rate limit:
 * which window is exhausted, current usage, and when it resets.
 */
export function describeRateLimit(
  snapshot: RateLimitSnapshot,
  now = new Date(),
): string {
  const parts: string[] = [];

  const dailyExhausted =
    snapshot.daily && snapshot.daily.usage >= snapshot.daily.limit;
  const shortExhausted =
    snapshot.shortTerm && snapshot.shortTerm.usage >= snapshot.shortTerm.limit;

  // Prefer reporting the window that is actually exhausted; the daily window is
  // the more serious one when both are hit.
  if (dailyExhausted && snapshot.daily) {
    const reset = nextDailyReset(now);
    const mins = Math.max(
      1,
      Math.round((reset.getTime() - now.getTime()) / 60000),
    );
    parts.push(
      `Daily rate limit reached (${snapshot.daily.usage}/${snapshot.daily.limit} requests). Resets at ${reset.toISOString()} (~${mins} min).`,
    );
  } else if (shortExhausted && snapshot.shortTerm) {
    const reset = next15MinReset(now);
    const mins = Math.max(
      1,
      Math.round((reset.getTime() - now.getTime()) / 60000),
    );
    parts.push(
      `15-minute rate limit reached (${snapshot.shortTerm.usage}/${snapshot.shortTerm.limit} requests). Resets at ${reset.toISOString()} (~${mins} min).`,
    );
  } else {
    // 429 without a clearly-exhausted window (e.g. read-quota only, or headers
    // missing) — fall back to the 15-minute reset, the most likely culprit.
    const reset = next15MinReset(now);
    const mins = Math.max(
      1,
      Math.round((reset.getTime() - now.getTime()) / 60000),
    );
    parts.push(
      `Strava rate limit reached. The 15-minute window resets at ${reset.toISOString()} (~${mins} min).`,
    );
  }

  if (snapshot.shortTerm) {
    parts.push(
      `15-min usage: ${snapshot.shortTerm.usage}/${snapshot.shortTerm.limit}.`,
    );
  }
  if (snapshot.daily) {
    parts.push(`Daily usage: ${snapshot.daily.usage}/${snapshot.daily.limit}.`);
  }
  if (snapshot.retryAfterSeconds !== undefined) {
    parts.push(`Retry-After: ${snapshot.retryAfterSeconds}s.`);
  }

  return parts.join(" ");
}

interface FetchConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  method?: string;
  responseType?: "json" | "text";
  /**
   * Skip the response cache for this request entirely — neither read a cached
   * value nor store the result. Used by write paths that need a guaranteed-fresh
   * read (e.g. composing an appended activity description), so they never act on
   * a stale cached copy.
   */
  skipCache?: boolean;
}

/**
 * Configures the {@link FetchClient} response cache. Caching is opt-in: without
 * a `ttlForPath`, the client never caches. The policy maps a request *path*
 * (URL minus base and query string) to a TTL in ms, or `null` to skip caching
 * that path — so only the resources you explicitly mark are cached.
 */
export interface ResponseCacheOptions {
  /**
   * Returns the cache TTL (ms) for a cacheable GET path, or `null` to not cache
   * it. Only GET/HEAD responses are ever cached.
   */
  ttlForPath: (path: string) => number | null;
  /** Max cached entries before LRU eviction (default 200). */
  maxEntries?: number;
  /** Injectable clock (ms) shared with the cache; tests override it. */
  now?: () => number;
}

/** Tunable backoff/retry behaviour for {@link FetchClient}. */
export interface RetryOptions {
  /** Max retry attempts beyond the initial request (default 2). */
  maxRetries?: number;
  /** Base delay for exponential backoff, in ms (default 500). */
  baseDelayMs?: number;
  /** Cap on any single backoff delay, in ms (default 8000). */
  maxDelayMs?: number;
  /**
   * Longest `Retry-After` we will wait out before giving up on a 429 and
   * surfacing a structured error instead, in ms (default 15000).
   */
  maxRetryAfterMs?: number;
  /** Sleep implementation; injectable so tests can run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Opt-in response cache for immutable-ish GETs. Omit to disable caching
   * entirely (the default for ad-hoc clients and most tests).
   */
  cache?: ResponseCacheOptions;
}

/**
 * Parses a JSON string while preserving integers that exceed
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1).
 *
 * Strava issues 64-bit identifiers — segment-effort ids in particular now run
 * well past 2^53 — which the default number-based `JSON.parse` silently rounds,
 * corrupting the id before any validation runs (and tripping Zod's safe-integer
 * bound). The reviver's third argument exposes the raw source text for each
 * value (supported by Bun's JavaScriptCore and Node >= 21), so we can detect an
 * unsafe integer and keep its exact digits as a string instead. Downstream id
 * schemas accept string ids, so they round-trip losslessly.
 *
 * On runtimes that don't expose the source text the reviver is a no-op and
 * parsing falls back to the (lossy) default — same behaviour as before.
 */
export function parseJsonWithLargeInts(text: string): unknown {
  const reviver = (
    _key: string,
    value: unknown,
    context?: { source?: string },
  ): unknown => {
    if (
      typeof value === "number" &&
      !Number.isSafeInteger(value) &&
      typeof context?.source === "string" &&
      /^-?\d+$/.test(context.source)
    ) {
      return context.source;
    }
    return value;
  };

  // The 3-arg reviver is cast to the standard 2-arg signature so this compiles
  // regardless of the TS lib version; engines still pass `context` at runtime.
  return JSON.parse(text, reviver as (key: string, value: unknown) => unknown);
}

export class FetchClient {
  private baseURL: string;
  private rateLimit: RateLimitSnapshot | null = null;

  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetryAfterMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Response cache + its policy, or `null` when caching is disabled. */
  private readonly responseCache: TtlLruCache<unknown> | null;
  private readonly ttlForPath: ((path: string) => number | null) | null;

  constructor(baseURL: string, options: RetryOptions = {}) {
    this.baseURL = baseURL;
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 8000;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? 15000;
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    if (options.cache) {
      this.responseCache = new TtlLruCache<unknown>({
        maxEntries: options.cache.maxEntries,
        now: options.cache.now,
      });
      this.ttlForPath = options.cache.ttlForPath;
    } else {
      this.responseCache = null;
      this.ttlForPath = null;
    }
  }

  /**
   * Reduces a request URL to the path used for cache policy + invalidation
   * matching: strips the base URL and any query string. Keeping the cache *key*
   * as the full URL (query included) keeps differently-parameterised reads
   * (e.g. stream resolutions) distinct, while the path drives TTL and write
   * invalidation.
   */
  private toPath(url: string): string {
    const noBase = url.startsWith(this.baseURL)
      ? url.slice(this.baseURL.length)
      : url;
    const queryIndex = noBase.indexOf("?");
    return queryIndex === -1 ? noBase : noBase.slice(0, queryIndex);
  }

  /** Clears the entire response cache (no-op when caching is disabled). */
  clearResponseCache(): void {
    this.responseCache?.clear();
  }

  /**
   * The rate-limit snapshot from the most recent response, or `null` if no
   * request carrying rate-limit headers has completed yet.
   */
  getRateLimitSnapshot(): RateLimitSnapshot | null {
    return this.rateLimit;
  }

  /** Exponential backoff with full jitter for retry attempt `n` (0-indexed). */
  private backoffDelay(attempt: number): number {
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
    return Math.round(Math.random() * exp);
  }

  private async request<T>(
    url: string,
    config: FetchConfig = {},
  ): Promise<{ data: T }> {
    const fullUrl = url.startsWith("http") ? url : `${this.baseURL}${url}`;
    const requestConfig = { ...config, url: fullUrl };

    // Build URL with query params
    if (requestConfig.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(requestConfig.params)) {
        searchParams.append(key, String(value));
      }
      const separator = requestConfig.url.includes("?") ? "&" : "?";
      requestConfig.url = `${requestConfig.url}${separator}${searchParams.toString()}`;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: requestConfig.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...requestConfig.headers,
      },
    };

    if (requestConfig.data) {
      fetchOptions.body = JSON.stringify(requestConfig.data);
    }

    // Only idempotent reads are retried. Writes (POST/PUT/DELETE) are never
    // blindly retried, since a transient failure may still have mutated state.
    const method = (fetchOptions.method ?? "GET").toUpperCase();
    const isRetriable = method === "GET" || method === "HEAD";

    // Response cache: serve immutable-ish GETs from memory, and invalidate a
    // resource's cached reads after it is written. The key is the full URL
    // (query included, so different stream resolutions stay distinct); TTL and
    // write invalidation match on the query-stripped path.
    const cacheKey = requestConfig.url;
    let cacheTtl: number | null = null;
    if (
      this.responseCache &&
      this.ttlForPath &&
      isRetriable &&
      !requestConfig.skipCache
    ) {
      cacheTtl = this.ttlForPath(this.toPath(requestConfig.url));
      if (cacheTtl !== null) {
        const cached = this.responseCache.get(cacheKey);
        if (cached !== undefined) {
          return { data: cached as T };
        }
      }
    }

    // Retry loop: transient (5xx / network) faults back off exponentially; a 429
    // honours Retry-After. All backoff lives here so every tool benefits.
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetch(requestConfig.url, fetchOptions);
      } catch (networkError) {
        // fetch rejects on network faults (ECONNRESET, DNS, aborted, etc.).
        if (isRetriable && attempt < this.maxRetries) {
          await this.sleep(this.backoffDelay(attempt));
          attempt += 1;
          continue;
        }
        throw networkError;
      }

      // Capture rate-limit headers from every response, success or error.
      this.rateLimit = parseRateLimitHeaders(response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        if (status === 429) {
          const snapshot = this.rateLimit;
          const retryAfterMs =
            snapshot.retryAfterSeconds !== undefined
              ? snapshot.retryAfterSeconds * 1000
              : this.backoffDelay(attempt);

          if (
            isRetriable &&
            attempt < this.maxRetries &&
            retryAfterMs <= this.maxRetryAfterMs
          ) {
            await this.sleep(retryAfterMs);
            attempt += 1;
            continue;
          }

          throw new RateLimitError(
            describeRateLimit(snapshot),
            {
              status,
              statusText: response.statusText,
              data: errorText,
            },
            snapshot,
            snapshot.retryAfterSeconds ?? null,
          );
        }

        if (
          TRANSIENT_STATUSES.has(status) &&
          isRetriable &&
          attempt < this.maxRetries
        ) {
          await this.sleep(this.backoffDelay(attempt));
          attempt += 1;
          continue;
        }

        throw new HttpError(`HTTP ${status}: ${errorText}`, {
          status,
          statusText: response.statusText,
          data: errorText,
        });
      }

      // Parse response
      let data: T;
      if (requestConfig.responseType === "text") {
        data = (await response.text()) as T;
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          // Parse via text so oversized Strava ids survive without precision loss.
          data = parseJsonWithLargeInts(await response.text()) as T;
        } else {
          data = (await response.text()) as T;
        }
      }

      if (this.responseCache) {
        // Cache a freshly-fetched cacheable GET.
        if (cacheTtl !== null) {
          this.responseCache.set(cacheKey, data, cacheTtl);
        }
        // A successful write invalidates every cached read under the same
        // resource path (e.g. updating an activity drops its cached detail,
        // streams, zones and laps so the next read re-fetches fresh).
        if (!isRetriable) {
          const writePath = this.toPath(requestConfig.url);
          this.responseCache.deleteMatching((key) => {
            const keyPath = this.toPath(key);
            return keyPath === writePath || keyPath.startsWith(`${writePath}/`);
          });
        }
      }

      return { data };
    }
  }

  async get<T>(url: string, config?: FetchConfig): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, method: "GET" });
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: FetchConfig,
  ): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, data, method: "POST" });
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: FetchConfig,
  ): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, data, method: "PUT" });
  }

  async delete<T>(url: string, config?: FetchConfig): Promise<{ data: T }> {
    return this.request<T>(url, { ...config, method: "DELETE" });
  }
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Cache TTL policy for Strava GET endpoints, keyed by request path. Returns a
 * TTL in ms for cacheable resources, or `null` to never cache (the default for
 * anything not listed — lists, segments, routes, exports, etc., which are
 * mutable or paginated).
 *
 * Immutable-once-recorded resources (a completed activity's detail and its data
 * streams) get long TTLs; identity/aggregate resources that drift (profile,
 * stats) get short ones. Activity detail is additionally invalidated whenever
 * the activity is written (see {@link updateActivity}), so its TTL only bounds
 * staleness from edits made outside this server.
 */
export function stravaCacheTtl(path: string): number | null {
  // Activity data streams — immutable once the activity is recorded.
  if (/^\/activities\/\d+\/streams\//.test(path)) return 6 * HOUR_MS;
  // Detailed activity — immutable-ish; invalidated on update-activity writes.
  if (/^\/activities\/\d+$/.test(path)) return HOUR_MS;
  // Authenticated athlete profile — short; name/weight/gear can change.
  if (path === "/athlete") return 5 * MINUTE_MS;
  // Athlete stats — short; totals accumulate with each new activity.
  if (/^\/athletes\/\d+\/stats$/.test(path)) return 5 * MINUTE_MS;
  return null;
}

// Create an instance for Strava API
export const stravaApi = new FetchClient("https://www.strava.com/api/v3", {
  cache: { ttlForPath: stravaCacheTtl },
});
