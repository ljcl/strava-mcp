import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { HttpError, RateLimitError, stravaApi } from "./fetchClient";
import { refreshAccessToken, TokenRevokedError } from "./tokenManager";
import {
  buildCreateActivityBody,
  buildUpdateActivityBody,
  type CreateActivityParams,
  type UpdateActivityParams,
} from "./utils/activityWrite";

/**
 * Strava resource identifier (activity, segment, segment-effort, athlete, etc.).
 *
 * Strava issues 64-bit ids; segment-effort ids in particular now exceed
 * `Number.MAX_SAFE_INTEGER`, which both loses precision under the default JSON
 * parse and trips `z.number().int()`'s safe-integer bound. The fetch client
 * preserves oversized integers as exact strings (see `parseJsonWithLargeInts`);
 * here we accept a number, bigint, or string and normalise to a string so ids
 * round-trip losslessly and never blow up validation.
 */
const StravaIdSchema = z
  .union([z.number(), z.bigint(), z.string()])
  .transform((value) => value.toString());

// SummaryActivity schema based on Strava Swagger spec
// Uses .passthrough() so Zod doesn't strip unrecognized fields
const StravaActivitySchema = z
  .object({
    id: StravaIdSchema,
    resource_state: z.number().int().optional(),
    athlete: z
      .object({ id: StravaIdSchema, resource_state: z.number().int() })
      .optional(),
    name: z.string(),
    distance: z.number(),
    moving_time: z.number().int().optional(),
    elapsed_time: z.number().int().optional(),
    total_elevation_gain: z.number().optional(),
    type: z.string().optional(),
    sport_type: z.string().optional(),
    workout_type: z.number().int().optional().nullable(),
    external_id: z.string().optional().nullable(),
    upload_id: StravaIdSchema.optional().nullable(),
    start_date: z.string().datetime(),
    start_date_local: z.string().datetime().optional(),
    timezone: z.string().optional(),
    utc_offset: z.number().optional(),
    start_latlng: z.array(z.number()).optional().nullable(),
    end_latlng: z.array(z.number()).optional().nullable(),
    achievement_count: z.number().int().optional(),
    kudos_count: z.number().int().optional(),
    comment_count: z.number().int().optional(),
    athlete_count: z.number().int().optional(),
    photo_count: z.number().int().optional(),
    map: z
      .object({
        id: z.string(),
        summary_polyline: z.string().optional().nullable(),
        resource_state: z.number().int(),
      })
      .nullable()
      .optional(),
    trainer: z.boolean().optional(),
    commute: z.boolean().optional(),
    manual: z.boolean().optional(),
    private: z.boolean().optional(),
    flagged: z.boolean().optional(),
    gear_id: z.string().optional().nullable(),
    from_accepted_tag: z.boolean().optional(),
    average_speed: z.number().optional(),
    max_speed: z.number().optional(),
    average_cadence: z.number().optional().nullable(),
    average_watts: z.number().optional().nullable(),
    weighted_average_watts: z.number().int().optional().nullable(),
    kilojoules: z.number().optional().nullable(),
    device_watts: z.boolean().optional().nullable(),
    has_heartrate: z.boolean().optional(),
    average_heartrate: z.number().optional().nullable(),
    max_heartrate: z.number().optional().nullable(),
    max_watts: z.number().int().optional().nullable(),
    elev_high: z.number().optional().nullable(),
    elev_low: z.number().optional().nullable(),
    pr_count: z.number().int().optional(),
    total_photo_count: z.number().int().optional(),
    has_kudoed: z.boolean().optional(),
    suffer_score: z.number().optional().nullable(),
    device_name: z.string().optional().nullable(),
  })
  .passthrough();

export type StravaSummaryActivity = z.infer<typeof StravaActivitySchema>;

// Define the expected response structure for the activities endpoint
const StravaActivitiesResponseSchema = z.array(StravaActivitySchema);

// Define the expected structure for the Authenticated Athlete response
const BaseAthleteSchema = z.object({
  id: StravaIdSchema,
  resource_state: z.number().int(),
});

// --- Athlete Gear (summary) Schema ---
// Gear as it appears in the shoes/bikes arrays on the detailed athlete profile.
const AthleteGearSchema = z.object({
  id: z.string(),
  resource_state: z.number().int().optional(),
  primary: z.boolean(),
  name: z.string(),
  nickname: z.string().nullable().optional(),
  retired: z.boolean().optional(),
  distance: z.number(),
});

const DetailedAthleteSchema = BaseAthleteSchema.extend({
  username: z.string().nullable(),
  firstname: z.string(),
  lastname: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  sex: z.enum(["M", "F"]).nullable(),
  premium: z.boolean(),
  summit: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  profile_medium: z.string().url(),
  profile: z.string().url(),
  weight: z.number().nullable(),
  measurement_preference: z.enum(["feet", "meters"]).optional().nullable(),
  // Add other fields as needed (e.g., follower_count, friend_count, ftp, clubs)
  shoes: z.array(AthleteGearSchema).optional(),
  bikes: z.array(AthleteGearSchema).optional(),
});

// Type alias for the inferred athlete type
export type StravaAthlete = z.infer<typeof DetailedAthleteSchema>;

// --- Stats Schemas ---
// Schema for individual activity totals (like runs, rides, swims)
const ActivityTotalSchema = z.object({
  count: z.number().int(),
  distance: z.number(), // In meters
  moving_time: z.number().int(), // In seconds
  elapsed_time: z.number().int(), // In seconds
  elevation_gain: z.number(), // In meters
  achievement_count: z.number().int().optional().nullable(), // Optional based on Strava docs examples
});

// Schema for the overall athlete stats response
const ActivityStatsSchema = z.object({
  biggest_ride_distance: z.number().optional().nullable(),
  biggest_climb_elevation_gain: z.number().optional().nullable(),
  recent_ride_totals: ActivityTotalSchema,
  recent_run_totals: ActivityTotalSchema,
  recent_swim_totals: ActivityTotalSchema,
  ytd_ride_totals: ActivityTotalSchema,
  ytd_run_totals: ActivityTotalSchema,
  ytd_swim_totals: ActivityTotalSchema,
  all_ride_totals: ActivityTotalSchema,
  all_run_totals: ActivityTotalSchema,
  all_swim_totals: ActivityTotalSchema,
});
export type StravaStats = z.infer<typeof ActivityStatsSchema>;

// --- Gear Schema ---
const SummaryGearSchema = z
  .object({
    id: z.string(),
    resource_state: z.number().int(),
    primary: z.boolean(),
    name: z.string(),
    distance: z.number(), // Distance in meters for the gear
  })
  .nullable()
  .optional(); // Activity might not have gear or it might be null

// --- Map Schema ---
const MapSchema = z
  .object({
    id: z.string(),
    // Detailed resources (activity, route) also carry the full-resolution
    // `polyline`; summaries only carry `summary_polyline`. Both are Google
    // encoded-polyline strings — see apps/server/src/polyline.ts.
    polyline: z.string().optional().nullable(),
    summary_polyline: z.string().optional().nullable(),
    resource_state: z.number().int(),
  })
  .nullable(); // Activity might not have a map

// --- Segment Schema ---
const SummarySegmentSchema = z.object({
  id: StravaIdSchema,
  name: z.string(),
  activity_type: z.string(),
  distance: z.number(),
  average_grade: z.number(),
  maximum_grade: z.number(),
  elevation_high: z.number().optional().nullable(),
  elevation_low: z.number().optional().nullable(),
  start_latlng: z.array(z.number()).optional().nullable(),
  end_latlng: z.array(z.number()).optional().nullable(),
  climb_category: z.number().int().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  private: z.boolean().optional(),
  starred: z.boolean().optional(),
});

const DetailedSegmentSchema = SummarySegmentSchema.extend({
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  total_elevation_gain: z.number().optional().nullable(),
  map: MapSchema, // Now defined above
  effort_count: z.number().int(),
  athlete_count: z.number().int(),
  hazardous: z.boolean(),
  star_count: z.number().int(),
});

export type StravaSegment = z.infer<typeof SummarySegmentSchema>;
export type StravaDetailedSegment = z.infer<typeof DetailedSegmentSchema>;
const StravaSegmentsResponseSchema = z.array(SummarySegmentSchema);

// --- Explorer Schemas ---
// Based on https://developers.strava.com/docs/reference/#api-models-ExplorerSegment
const ExplorerSegmentSchema = z.object({
  id: StravaIdSchema,
  name: z.string(),
  climb_category: z.number().int(),
  climb_category_desc: z.string(), // e.g., "NC", "4", "3", "2", "1", "HC"
  avg_grade: z.number(),
  start_latlng: z.array(z.number()),
  end_latlng: z.array(z.number()),
  elev_difference: z.number(),
  distance: z.number(), // meters
  points: z.string(), // Encoded polyline
  starred: z.boolean().optional(), // Only included if authenticated
});

// Based on https://developers.strava.com/docs/reference/#api-models-ExplorerResponse
const ExplorerResponseSchema = z.object({
  segments: z.array(ExplorerSegmentSchema),
});
export type StravaExplorerResponse = z.infer<typeof ExplorerResponseSchema>;

// --- Detailed Activity Schema ---
// Based on https://developers.strava.com/docs/reference/#api-models-DetailedActivity
const DetailedActivitySchema = z.object({
  id: StravaIdSchema,
  resource_state: z.number().int(), // Should be 3 for detailed
  athlete: BaseAthleteSchema, // Contains athlete ID
  name: z.string(),
  distance: z.number().optional(), // Optional for stationary activities
  moving_time: z.number().int().optional(),
  elapsed_time: z.number().int(),
  total_elevation_gain: z.number().optional(),
  type: z.string(), // e.g., "Run", "Ride"
  sport_type: z.string(),
  start_date: z.string().datetime(),
  start_date_local: z.string().datetime(),
  timezone: z.string(),
  start_latlng: z.array(z.number()).nullable(),
  end_latlng: z.array(z.number()).nullable(),
  achievement_count: z.number().int().optional(),
  kudos_count: z.number().int(),
  comment_count: z.number().int(),
  athlete_count: z.number().int().optional(), // Number of athletes on the activity
  photo_count: z.number().int(),
  map: MapSchema,
  trainer: z.boolean(),
  commute: z.boolean(),
  manual: z.boolean(),
  private: z.boolean(),
  flagged: z.boolean(),
  gear_id: z.string().nullable(), // ID of the gear used
  average_speed: z.number().optional(),
  max_speed: z.number().optional(),
  average_cadence: z.number().optional().nullable(),
  average_temp: z.number().int().optional().nullable(),
  average_watts: z.number().optional().nullable(), // Rides only
  max_watts: z.number().int().optional().nullable(), // Rides only
  weighted_average_watts: z.number().int().optional().nullable(), // Rides only
  kilojoules: z.number().optional().nullable(), // Rides only
  device_watts: z.boolean().optional().nullable(), // Rides only
  has_heartrate: z.boolean(),
  average_heartrate: z.number().optional().nullable(),
  max_heartrate: z.number().optional().nullable(),
  calories: z.number().optional(),
  description: z.string().nullable(),
  // photos: // Add PhotosSummary schema if needed
  gear: SummaryGearSchema,
  device_name: z.string().optional().nullable(),
  // Note: best_efforts is added below after DetailedSegmentEffortSchema is defined
  // segment_efforts: // Add DetailedSegmentEffort schema if needed
  // splits_metric: // Add Split schema if needed
  // splits_standard: // Add Split schema if needed
  // laps: // Add Lap schema if needed
});

// --- Meta Schemas ---
// Based on https://developers.strava.com/docs/reference/#api-models-MetaActivity
const MetaActivitySchema = z.object({
  id: StravaIdSchema,
});

// BaseAthleteSchema serves as MetaAthleteSchema (id only needed for effort)

// --- Segment Effort Schema ---
// Based on https://developers.strava.com/docs/reference/#api-models-DetailedSegmentEffort
const DetailedSegmentEffortSchema = z.object({
  id: StravaIdSchema,
  activity: MetaActivitySchema,
  athlete: BaseAthleteSchema,
  segment: SummarySegmentSchema, // Reuse SummarySegmentSchema
  name: z.string(), // Segment name
  elapsed_time: z.number().int(), // seconds
  moving_time: z.number().int(), // seconds
  start_date: z.string().datetime(),
  start_date_local: z.string().datetime(),
  distance: z.number(), // meters
  start_index: z.number().int().optional().nullable(),
  end_index: z.number().int().optional().nullable(),
  average_cadence: z.number().optional().nullable(),
  device_watts: z.boolean().optional().nullable(),
  average_watts: z.number().optional().nullable(),
  average_heartrate: z.number().optional().nullable(),
  max_heartrate: z.number().optional().nullable(),
  kom_rank: z.number().int().optional().nullable(), // 1-10, null if not in top 10
  pr_rank: z.number().int().optional().nullable(), // 1, 2, 3, or null
  hidden: z.boolean().optional().nullable(),
});
export type StravaDetailedSegmentEffort = z.infer<
  typeof DetailedSegmentEffortSchema
>;

// --- Best Effort Schema ---
// Best efforts are different from segment efforts - they represent time-based achievements
// (e.g., best 400m, 1/2 mile, 1k, etc.) and don't have a segment field (or it's null)
const BestEffortSchema = z.object({
  id: StravaIdSchema,
  activity: MetaActivitySchema.optional(),
  athlete: BaseAthleteSchema.optional(),
  segment: SummarySegmentSchema.nullish(), // Best efforts don't have segments, but API may return null
  name: z.string(), // e.g., "400m", "1/2 mile", "1k"
  elapsed_time: z.number().int(), // seconds
  moving_time: z.number().int(), // seconds
  start_date: z.string().datetime(),
  start_date_local: z.string().datetime(),
  distance: z.number(), // meters
  start_index: z.number().int().optional().nullable(),
  end_index: z.number().int().optional().nullable(),
  average_cadence: z.number().optional().nullable(),
  device_watts: z.boolean().optional().nullable(),
  average_watts: z.number().optional().nullable(),
  average_heartrate: z.number().optional().nullable(),
  max_heartrate: z.number().optional().nullable(),
  kom_rank: z.number().int().optional().nullable(), // 1-10, null if not in top 10
  pr_rank: z.number().int().optional().nullable(), // 1, 2, 3, or null
  hidden: z.boolean().optional().nullable(),
});

// Extend DetailedActivitySchema to include best_efforts and segment_efforts now that the schemas are defined
const ExtendedDetailedActivitySchema = DetailedActivitySchema.extend({
  best_efforts: z.array(BestEffortSchema).optional(),
  segment_efforts: z.array(DetailedSegmentEffortSchema).optional(),
});
export type StravaDetailedActivity = z.infer<
  typeof ExtendedDetailedActivitySchema
>;

// --- Route Schema ---
// Based on https://developers.strava.com/docs/reference/#api-models-Route
const RouteSchema = z.object({
  athlete: BaseAthleteSchema, // Reuse BaseAthleteSchema
  description: z.string().nullable(),
  distance: z.number(), // meters
  elevation_gain: z.number().nullable(), // meters
  id: StravaIdSchema,
  id_str: z.string(),
  map: MapSchema, // Reuse MapSchema
  map_urls: z
    .object({
      // Assuming structure based on context
      retina_url: z.string().url().optional().nullable(),
      url: z.string().url().optional().nullable(),
    })
    .optional()
    .nullable(),
  name: z.string(),
  private: z.boolean(),
  resource_state: z.number().int(),
  starred: z.boolean(),
  sub_type: z.number().int(), // 1 for "road", 2 for "mtb", 3 for "cx", 4 for "trail", 5 for "mixed"
  type: z.number().int(), // 1 for "ride", 2 for "run"
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  estimated_moving_time: z.number().int().optional().nullable(), // seconds
  segments: z.array(SummarySegmentSchema).optional().nullable(), // Array of segments within the route
  timestamp: z.number().int().optional().nullable(), // Added based on common patterns
});
export type StravaRoute = z.infer<typeof RouteSchema>;
const StravaRoutesResponseSchema = z.array(RouteSchema);

// --- Schema Exports for Testing ---
export {
  ActivityStatsSchema,
  AthleteGearSchema,
  DetailedAthleteSchema,
  DetailedSegmentSchema,
  ExtendedDetailedActivitySchema as DetailedActivitySchema,
  RouteSchema,
  SummarySegmentSchema,
};

// --- Token Refresh Functionality ---
// Token refresh lives entirely in tokenManager, which owns the single,
// concurrency-safe refresh path (one in-flight exchange shared across callers)
// and atomic persistence of tokens.json. handleApiError delegates to it on 401.

// Every retryFn recursively re-enters the public client function, whose own
// catch would otherwise refresh-and-retry again on another 401 — a
// scope-stripped token that still refreshes successfully would loop forever.
// The retried invocation runs inside this context, so nested handleApiError
// calls see it and skip the refresh path: at most one recovery per call.
const authRetryContext = new AsyncLocalStorage<true>();

/**
 * Helper function to handle API errors with token refresh capability
 * @param error - The caught error
 * @param context - The context in which the error occurred
 * @param retryFn - Optional function to retry after token refresh
 * @returns Never returns normally, always throws an error or returns via retryFn
 */
async function handleApiError<T>(
  error: unknown,
  context: string,
  retryFn?: () => Promise<T>,
): Promise<T> {
  // Check if it's a fetch error with response data
  const isHttpError = error instanceof HttpError;
  const status = isHttpError ? error.response.status : undefined;

  // Check if it's an authentication error (401) that might be fixed by refreshing the token
  if (status === 401 && retryFn && !authRetryContext.getStore()) {
    let refreshed = false;
    try {
      console.error(
        `🔑 Authentication error in ${context}. Attempting to refresh token...`,
      );
      await refreshAccessToken();
      refreshed = true;
    } catch (refreshError) {
      // A revoked refresh token can never recover by retrying — surface the
      // actionable re-auth instruction instead of the original 401.
      if (refreshError instanceof TokenRevokedError) {
        console.error(`❌ ${refreshError.message}`);
        throw new Error(
          `Strava authentication failed in ${context}: ${refreshError.message}`,
        );
      }
      console.error(
        `❌ Token refresh failed: ${
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError)
        }`,
      );
      // Fall through to normal error handling if refresh fails
    }
    if (refreshed) {
      console.error(`🔄 Retrying ${context} after token refresh...`);
      return await authRetryContext.run(true, retryFn);
    }
  }

  // Rate limit exhausted (429). The fetch layer has already honoured any
  // Retry-After and retried where it could; by the time it surfaces here the
  // window is genuinely exhausted. Return a structured, actionable message
  // (which window, when it resets) instead of the raw "Strava API Error (429)".
  if (error instanceof RateLimitError) {
    console.error(`⏳ Strava rate limit hit in ${context}: ${error.message}`);
    throw new Error(
      `Strava rate limit exceeded in ${context}. ${error.message}`,
    );
  }

  // Check for subscription error (402)
  if (status === 402) {
    console.error(`🔒 Subscription Required in ${context}. Status: 402`);
    // Throw a specific error type or use a unique message
    throw new Error(
      `SUBSCRIPTION_REQUIRED: Access to this feature requires a Strava subscription. Context: ${context}`,
    );
  }

  // Standard error handling
  if (isHttpError) {
    const responseData = error.response.data;
    let message = error.message;
    try {
      const parsed: unknown = JSON.parse(responseData);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "message" in parsed &&
        typeof (parsed as { message: unknown }).message === "string"
      ) {
        message = (parsed as { message: string }).message;
      }
    } catch {
      // responseData is not JSON, use error.message
    }
    console.error(
      `Strava API request failed in ${context} with status ${status}: ${message}`,
    );
    if (responseData) {
      console.error(`Response data (${context}):`, responseData);
    }
    throw new Error(`Strava API Error in ${context} (${status}): ${message}`);
  }
  if (error instanceof Error) {
    console.error(`An unexpected error occurred in ${context}:`, error);
    throw new Error(
      `An unexpected error occurred in ${context}: ${error.message}`,
    );
  }
  console.error(`An unknown error object was caught in ${context}:`, error);
  throw new Error(`An unknown error occurred in ${context}: ${String(error)}`);
}

/**
 * Fetches all activities for the authenticated athlete with pagination and date filtering.
 * Automatically handles multiple pages to retrieve complete activity history.
 *
 * @param accessToken - The Strava API access token.
 * @param params - Parameters for filtering and pagination.
 * @returns A promise that resolves to an array of all matching Strava activities.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getAllActivities(
  accessToken: string,
  params: GetAllActivitiesParams = {},
): Promise<StravaSummaryActivity[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  const {
    page = 1,
    perPage = 200, // Max allowed by Strava
    before,
    after,
    onProgress,
    maxItems,
    countActivity,
  } = params;

  const allActivities: StravaSummaryActivity[] = [];
  let currentPage = page;
  let hasMore = true;
  let matchedCount = 0;

  try {
    while (hasMore) {
      // Build query parameters
      const queryParams: Record<string, string | number | boolean> = {
        page: currentPage,
        per_page: perPage,
      };

      // Add date filters if provided
      if (before !== undefined) queryParams.before = before;
      if (after !== undefined) queryParams.after = after;

      // Fetch current page
      const response = await stravaApi.get<unknown>("/athlete/activities", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: queryParams,
      });

      const validationResult = StravaActivitiesResponseSchema.safeParse(
        response.data,
      );

      if (!validationResult.success) {
        console.error(
          `Strava API response validation failed (getAllActivities page ${currentPage}):`,
          validationResult.error,
        );
        throw new Error(
          `Invalid data format received from Strava API: ${validationResult.error.message}`,
        );
      }

      const activities = validationResult.data;

      // Add activities to collection
      allActivities.push(...activities);
      matchedCount += countActivity
        ? activities.filter(countActivity).length
        : activities.length;

      // Report progress if callback provided
      if (onProgress) {
        onProgress(allActivities.length, currentPage);
      }

      // Check if we should continue
      // Stop if we got fewer activities than requested (indicating last page)
      // or once the caller's cap is satisfied.
      hasMore =
        activities.length === perPage &&
        (maxItems === undefined || matchedCount < maxItems);
      currentPage += 1;

      // Add a small delay to be respectful of rate limits
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return allActivities;
  } catch (error) {
    // If it's an auth error and we're on first page, try token refresh
    if (currentPage === 1) {
      return await handleApiError<StravaSummaryActivity[]>(
        error,
        "getAllActivities",
        async () => {
          const newToken = process.env.STRAVA_ACCESS_TOKEN!;
          return getAllActivities(newToken, params);
        },
      );
    }
    // For subsequent pages, just throw the error
    throw error;
  }
}

/**
 * Fetches profile information for the authenticated athlete.
 *
 * @param accessToken - The Strava API access token.
 * @returns A promise that resolves to the detailed athlete profile.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getAuthenticatedAthlete(
  accessToken: string,
): Promise<StravaAthlete> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    const response = await stravaApi.get<unknown>("/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Validate the response data against the Zod schema
    const validationResult = DetailedAthleteSchema.safeParse(response.data);

    if (!validationResult.success) {
      // Log the raw response data on validation failure for debugging
      console.error(
        "Strava API raw response data (getAuthenticatedAthlete):",
        JSON.stringify(response.data, null, 2),
      );
      console.error(
        "Strava API response validation failed (getAuthenticatedAthlete):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    // Type assertion is safe here due to successful validation
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaAthlete>(
      error,
      "getAuthenticatedAthlete",
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getAuthenticatedAthlete(newToken);
      },
    );
  }
}

/**
 * Fetches activity statistics for a specific athlete.
 *
 * @param accessToken - The Strava API access token.
 * @param athleteId - The ID of the athlete whose stats are being requested.
 * @returns A promise that resolves to the athlete's activity statistics.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getAthleteStats(
  accessToken: string,
  athleteId: number | string,
): Promise<StravaStats> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!athleteId) {
    throw new Error("Athlete ID is required to fetch stats.");
  }

  try {
    const response = await stravaApi.get<unknown>(
      `/athletes/${athleteId}/stats`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const validationResult = ActivityStatsSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        "Strava API response validation failed (getAthleteStats):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaStats>(
      error,
      `getAthleteStats for ID ${athleteId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getAthleteStats(newToken, athleteId);
      },
    );
  }
}

/**
 * Fetches detailed information for a specific activity by its ID.
 *
 * @param accessToken - The Strava API access token.
 * @param activityId - The ID of the activity to fetch.
 * @param options - `skipCache: true` forces a fresh fetch, bypassing the
 *   response cache (used by write paths that must read current state).
 * @returns A promise that resolves to the detailed activity data.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getActivityById(
  accessToken: string,
  activityId: number | string,
  options: { skipCache?: boolean } = {},
): Promise<StravaDetailedActivity> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!activityId) {
    throw new Error("Activity ID is required to fetch details.");
  }

  try {
    const response = await stravaApi.get<unknown>(`/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      skipCache: options.skipCache,
    });

    const validationResult = ExtendedDetailedActivitySchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getActivityById: ${activityId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedActivity>(
      error,
      `getActivityById for ID ${activityId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getActivityById(newToken, activityId, options);
      },
    );
  }
}

/**
 * Lists the segments starred by the authenticated athlete.
 *
 * @param accessToken - The Strava API access token.
 * @returns A promise that resolves to an array of the athlete's starred segments.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function listStarredSegments(
  accessToken: string,
): Promise<StravaSegment[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    // Strava API uses page/per_page but often defaults reasonably for lists like this.
    // Add pagination parameters if needed later.
    const response = await stravaApi.get<unknown>("/segments/starred", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const validationResult = StravaSegmentsResponseSchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        "Strava API validation failed (listStarredSegments):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaSegment[]>(
      error,
      "listStarredSegments",
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return listStarredSegments(newToken);
      },
    );
  }
}

/**
 * Fetches detailed information for a specific segment by its ID.
 *
 * @param accessToken - The Strava API access token.
 * @param segmentId - The ID of the segment to fetch.
 * @returns A promise that resolves to the detailed segment data.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getSegmentById(
  accessToken: string,
  segmentId: number | string,
): Promise<StravaDetailedSegment> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!segmentId) {
    throw new Error("Segment ID is required.");
  }

  try {
    const response = await stravaApi.get<unknown>(`/segments/${segmentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const validationResult = DetailedSegmentSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getSegmentById: ${segmentId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedSegment>(
      error,
      `getSegmentById for ID ${segmentId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getSegmentById(newToken, segmentId);
      },
    );
  }
}

/**
 * Returns the top 10 segments matching a specified query.
 *
 * @param accessToken - The Strava API access token.
 * @param bounds - String representing the latitudes and longitudes for the corners of the search map, `latitude,longitude,latitude,longitude`.
 * @param activityType - Optional filter for activity type ("running" or "riding").
 * @param minCat - Optional minimum climb category filter.
 * @param maxCat - Optional maximum climb category filter.
 * @returns A promise that resolves to the explorer response containing matching segments.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function exploreSegments(
  accessToken: string,
  bounds: string,
  activityType?: "running" | "riding",
  minCat?: number,
  maxCat?: number,
): Promise<StravaExplorerResponse> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (
    !bounds ||
    !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(bounds)
  ) {
    throw new Error(
      "Valid bounds (lat,lng,lat,lng) are required for exploring segments.",
    );
  }

  const params: Record<string, string | number | boolean> = {
    bounds: bounds,
  };
  if (activityType !== undefined) params.activity_type = activityType;
  if (minCat !== undefined) params.min_cat = minCat;
  if (maxCat !== undefined) params.max_cat = maxCat;

  try {
    const response = await stravaApi.get<unknown>("/segments/explore", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: params,
    });

    const validationResult = ExplorerResponseSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        "Strava API validation failed (exploreSegments):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaExplorerResponse>(
      error,
      `exploreSegments with bounds ${bounds}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return exploreSegments(newToken, bounds, activityType, minCat, maxCat);
      },
    );
  }
}

/**
 * Stars or unstars a segment for the authenticated athlete.
 *
 * @param accessToken - The Strava API access token.
 * @param segmentId - The ID of the segment to star/unstar.
 * @param starred - Boolean indicating whether to star (true) or unstar (false) the segment.
 * @returns A promise that resolves to the detailed segment data after the update.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function starSegment(
  accessToken: string,
  segmentId: number | string,
  starred: boolean,
): Promise<StravaDetailedSegment> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!segmentId) {
    throw new Error("Segment ID is required to star/unstar.");
  }
  if (starred === undefined) {
    throw new Error("Starred status (true/false) is required.");
  }

  try {
    const response = await stravaApi.put<unknown>(
      `/segments/${segmentId}/starred`,
      { starred: starred }, // Data payload for the PUT request
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json", // Important for PUT requests with body
        },
      },
    );

    // The response is expected to be the updated DetailedSegment
    const validationResult = DetailedSegmentSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (starSegment: ${segmentId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedSegment>(
      error,
      `starSegment for ID ${segmentId} with starred=${starred}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return starSegment(newToken, segmentId, starred);
      },
    );
  }
}

/**
 * Fetches detailed information about a specific segment effort by its ID.
 *
 * @param accessToken - The Strava API access token.
 * @param effortId - The ID of the segment effort to fetch.
 * @returns A promise that resolves to the detailed segment effort data.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getSegmentEffort(
  accessToken: string,
  effortId: number | string,
): Promise<StravaDetailedSegmentEffort> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!effortId) {
    throw new Error("Segment Effort ID is required to fetch details.");
  }

  try {
    const response = await stravaApi.get<unknown>(
      `/segment_efforts/${effortId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const validationResult = DetailedSegmentEffortSchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getSegmentEffort: ${effortId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedSegmentEffort>(
      error,
      `getSegmentEffort for ID ${effortId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getSegmentEffort(newToken, effortId);
      },
    );
  }
}

/**
 * Fetches a list of segment efforts for a given segment, filtered by date range for the authenticated athlete.
 *
 * @param accessToken - The Strava API access token.
 * @param segmentId - The ID of the segment.
 * @param startDateLocal - Optional ISO 8601 start date.
 * @param endDateLocal - Optional ISO 8601 end date.
 * @param perPage - Optional number of items per page.
 * @returns A promise that resolves to an array of segment efforts.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function listSegmentEfforts(
  accessToken: string,
  segmentId: number | string,
  params: SegmentEffortsParams = {},
): Promise<StravaDetailedSegmentEffort[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!segmentId) {
    throw new Error("Segment ID is required to list efforts.");
  }

  const { startDateLocal, endDateLocal, perPage } = params;

  const queryParams: Record<string, string | number | boolean> = {
    segment_id: segmentId,
  };
  if (startDateLocal) queryParams.start_date_local = startDateLocal;
  if (endDateLocal) queryParams.end_date_local = endDateLocal;
  if (perPage) queryParams.per_page = perPage;

  try {
    const response = await stravaApi.get<unknown>("/segment_efforts", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: queryParams,
    });

    // Response is an array of DetailedSegmentEffort
    const validationResult = z
      .array(DetailedSegmentEffortSchema)
      .safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (listSegmentEfforts: segment ${segmentId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedSegmentEffort[]>(
      error,
      `listSegmentEfforts for segment ID ${segmentId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return listSegmentEfforts(newToken, segmentId, params);
      },
    );
  }
}

// Add the missing interface for segment efforts parameters
export interface SegmentEffortsParams {
  startDateLocal?: string;
  endDateLocal?: string;
  perPage?: number;
}

// Interface for getAllActivities parameters
export interface GetAllActivitiesParams {
  page?: number;
  perPage?: number;
  before?: number; // epoch timestamp in seconds
  after?: number; // epoch timestamp in seconds
  onProgress?: (fetched: number, page: number) => void;
  /**
   * Stop paginating once at least this many activities have been collected.
   * The page that satisfies the cap is returned in full (no trimming), so
   * callers apply their own final slice.
   */
  maxItems?: number;
  /**
   * Which activities count toward `maxItems` (default: all). Lets callers
   * that post-filter (e.g. runs only) keep paginating until enough matching
   * activities have arrived without fetching the whole history.
   */
  countActivity?: (activity: StravaSummaryActivity) => boolean;
}

/**
 * Lists routes created by a specific athlete.
 *
 * @param accessToken - The Strava API access token.
 * @param athleteId - The ID of the athlete whose routes are being requested.
 * @param page - Optional page number for pagination.
 * @param perPage - Optional number of items per page.
 * @returns A promise that resolves to an array of the athlete's routes.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function listAthleteRoutes(
  accessToken: string,
  page = 1,
  perPage = 30,
): Promise<StravaRoute[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    const response = await stravaApi.get<unknown>("/athlete/routes", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        page: page,
        per_page: perPage,
      },
    });

    const validationResult = StravaRoutesResponseSchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        "Strava API validation failed (listAthleteRoutes):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaRoute[]>(
      error,
      "listAthleteRoutes",
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return listAthleteRoutes(newToken, page, perPage);
      },
    );
  }
}

/**
 * Fetches detailed information for a specific route by its ID.
 *
 * @param accessToken - The Strava API access token.
 * @param routeId - The ID of the route to fetch.
 * @returns A promise that resolves to the detailed route data.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getRouteById(
  accessToken: string,
  routeId: string,
): Promise<StravaRoute> {
  const url = `/routes/${routeId}`;
  try {
    const response = await stravaApi.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Validate the response against the Zod schema
    const validatedRoute = RouteSchema.parse(response.data);
    return validatedRoute;
  } catch (error) {
    return await handleApiError<StravaRoute>(
      error,
      `fetching route ${routeId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getRouteById(newToken, routeId);
      },
    );
  }
}

/**
 * Fetches the GPX data for a specific route.
 * Note: This endpoint returns raw GPX data (XML string), not JSON.
 * @param accessToken Strava API access token
 * @param routeId The ID of the route to export
 * @returns Promise resolving to the GPX data as a string
 */
export async function exportRouteGpx(
  accessToken: string,
  routeId: string,
): Promise<string> {
  const url = `/routes/${routeId}/export_gpx`;
  try {
    // Expecting text/xml response, Axios should handle it as string
    const response = await stravaApi.get<string>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Ensure response is treated as text
      responseType: "text",
    });
    if (typeof response.data !== "string") {
      throw new Error(
        "Invalid response format received from Strava API for GPX export.",
      );
    }
    return response.data;
  } catch (error) {
    return await handleApiError<string>(
      error,
      `exporting route ${routeId} as GPX`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return exportRouteGpx(newToken, routeId);
      },
    );
  }
}

/**
 * Fetches the TCX data for a specific route.
 * Note: This endpoint returns raw TCX data (XML string), not JSON.
 * @param accessToken Strava API access token
 * @param routeId The ID of the route to export
 * @returns Promise resolving to the TCX data as a string
 */
export async function exportRouteTcx(
  accessToken: string,
  routeId: string,
): Promise<string> {
  const url = `/routes/${routeId}/export_tcx`;
  try {
    // Expecting text/xml response, Axios should handle it as string
    const response = await stravaApi.get<string>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Ensure response is treated as text
      responseType: "text",
    });
    if (typeof response.data !== "string") {
      throw new Error(
        "Invalid response format received from Strava API for TCX export.",
      );
    }
    return response.data;
  } catch (error) {
    return await handleApiError<string>(
      error,
      `exporting route ${routeId} as TCX`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return exportRouteTcx(newToken, routeId);
      },
    );
  }
}

// --- Photo Schema ---
// Based on https://developers.strava.com/docs/reference/#api-models-Photo
const PhotoSchema = z.object({
  id: StravaIdSchema.nullable().optional(), // Photo ID (may be null for some sources)
  unique_id: z.string().nullable().optional(), // Unique identifier
  urls: z.record(z.string(), z.string()).optional(), // Maps size names (e.g., "100", "600", "1800") to URLs
  source: z.number().int().optional(), // 1 = Strava, 2 = Instagram
  uploaded_at: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
  created_at_local: z.string().optional().nullable(),
  location: z.array(z.number()).nullable().optional(), // [lat, lng]
  caption: z.string().nullable().optional(),
  activity_id: StravaIdSchema.optional(),
  activity_name: z.string().optional().nullable(),
  resource_state: z.number().int().optional(),
  athlete_id: StravaIdSchema.optional().nullable(),
  post_id: StravaIdSchema.nullable().optional(),
  default_photo: z.boolean().optional(),
  type: z.union([z.string(), z.number()]).optional(), // Can be number (1) or string ("InstagramPhoto")
  status: z.number().int().optional(), // Processing status
  placeholder_image: z
    .object({
      light_url: z.string().optional(),
      dark_url: z.string().optional(),
    })
    .nullable()
    .optional(),
  sizes: z.record(z.string(), z.array(z.number())).optional(), // Maps size names to [width, height]
  cursor: z.unknown().optional(), // Pagination cursor
});

export type StravaPhoto = z.infer<typeof PhotoSchema>;
const StravaPhotosResponseSchema = z.array(PhotoSchema);

// --- Lap Schema ---
// Based on https://developers.strava.com/docs/reference/#api-models-Lap and user-provided image
const LapSchema = z.object({
  id: StravaIdSchema,
  resource_state: z.number().int(),
  name: z.string(),
  activity: BaseAthleteSchema, // Reusing BaseAthleteSchema for {id, resource_state}
  athlete: BaseAthleteSchema, // Reusing BaseAthleteSchema for {id, resource_state}
  elapsed_time: z.number().int(), // In seconds
  moving_time: z.number().int(), // In seconds
  start_date: z.string().datetime(),
  start_date_local: z.string().datetime(),
  distance: z.number(), // In meters
  start_index: z.number().int().optional().nullable(), // Index in the activity stream
  end_index: z.number().int().optional().nullable(), // Index in the activity stream
  total_elevation_gain: z.number().optional().nullable(), // In meters
  average_speed: z.number().optional().nullable(), // In meters per second
  max_speed: z.number().optional().nullable(), // In meters per second
  average_cadence: z.number().optional().nullable(), // RPM
  average_watts: z.number().optional().nullable(), // Rides only
  device_watts: z.boolean().optional().nullable(), // Whether power sensor was used
  average_heartrate: z.number().optional().nullable(), // Average heart rate during lap
  max_heartrate: z.number().optional().nullable(), // Max heart rate during lap
  lap_index: z.number().int(), // The position of this lap in the activity
  split: z.number().int().optional().nullable(), // Associated split number (e.g., for marathons)
});

export type StravaLap = z.infer<typeof LapSchema>;
const StravaLapsResponseSchema = z.array(LapSchema);

/**
 * Retrieves the laps for a specific activity.
 * @param accessToken The Strava API access token.
 * @param activityId The ID of the activity.
 * @returns A promise resolving to an array of lap objects.
 */
export async function getActivityLaps(
  accessToken: string,
  activityId: number | string,
): Promise<StravaLap[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    const response = await stravaApi.get(`/activities/${activityId}/laps`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const validationResult = StravaLapsResponseSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getActivityLaps: ${activityId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }

    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaLap[]>(
      error,
      `getActivityLaps(${activityId})`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getActivityLaps(newToken, activityId);
      },
    );
  }
}

// --- Zone Schemas ---
const DistributionBucketSchema = z.object({
  max: z.number(),
  min: z.number(),
  time: z.number().int(), // Time in seconds spent in this bucket
});

const ZoneSchema = z.object({
  min: z.number(),
  max: z.number().optional(), // Max might be absent for the last zone
});

const HeartRateZoneSchema = z.object({
  custom_zones: z.boolean(),
  zones: z.array(ZoneSchema),
  distribution_buckets: z.array(DistributionBucketSchema).optional(), // Optional based on sample
  resource_state: z.number().int().optional(), // Optional based on sample
  sensor_based: z.boolean().optional(), // Optional based on sample
  points: z.number().int().optional(), // Optional based on sample
  type: z.literal("heartrate").optional(), // Optional based on sample
});

const PowerZoneSchema = z.object({
  zones: z.array(ZoneSchema),
  distribution_buckets: z.array(DistributionBucketSchema).optional(), // Optional based on sample
  resource_state: z.number().int().optional(), // Optional based on sample
  sensor_based: z.boolean().optional(), // Optional based on sample
  points: z.number().int().optional(), // Optional based on sample
  type: z.literal("power").optional(), // Optional based on sample
});

// Combined Zones Response Schema
const AthleteZonesSchema = z.object({
  heart_rate: HeartRateZoneSchema.optional(), // Heart rate zones might not be set
  power: PowerZoneSchema.optional(), // Power zones might not be set
});

export type StravaAthleteZones = z.infer<typeof AthleteZonesSchema>;

/**
 * Retrieves the heart rate and power zones for the authenticated athlete.
 * @param accessToken The Strava API access token.
 * @returns A promise resolving to the athlete's zone data.
 */
export async function getAthleteZones(
  accessToken: string,
): Promise<StravaAthleteZones> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    const response = await stravaApi.get<unknown>("/athlete/zones", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const validationResult = AthleteZonesSchema.safeParse(response.data);

    if (!validationResult.success) {
      console.error(
        "Strava API validation failed (getAthleteZones):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }

    return validationResult.data;
  } catch (error) {
    // Note: This endpoint requires profile:read_all scope
    // Handle potential 403 Forbidden if scope is missing, or 402 if it becomes sub-only?
    return await handleApiError<StravaAthleteZones>(
      error,
      "getAthleteZones",
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getAthleteZones(newToken);
      },
    );
  }
}

// --- Activity Zones Schema ---
// GET /activities/{id}/zones returns an array of zone objects (heartrate /
// power), each carrying `distribution_buckets` describing how long was spent in
// each zone band (the final bucket uses max: -1 for "and above").
// Based on https://developers.strava.com/docs/reference/#api-models-ActivityZone
export const ActivityZoneSchema = z
  .object({
    type: z.enum(["heartrate", "power"]).optional(),
    score: z.number().optional().nullable(),
    sensor_based: z.boolean().optional().nullable(),
    points: z.number().int().optional().nullable(),
    custom_zones: z.boolean().optional().nullable(),
    max: z.number().optional().nullable(),
    resource_state: z.number().int().optional(),
    distribution_buckets: z.array(DistributionBucketSchema),
  })
  .passthrough();

export type StravaActivityZone = z.infer<typeof ActivityZoneSchema>;
const StravaActivityZonesResponseSchema = z.array(ActivityZoneSchema);

/**
 * Retrieves the time-in-zone distribution for a specific activity.
 *
 * `GET /activities/{id}/zones` returns one entry per zone type the activity
 * recorded (heart rate and/or power), each with `distribution_buckets`
 * describing how long was spent in each zone band. Private activities require
 * the `activity:read_all` scope.
 *
 * @param accessToken - The Strava API access token.
 * @param activityId - The ID of the activity.
 * @returns A promise resolving to an array of activity zone objects.
 */
export async function getActivityZones(
  accessToken: string,
  activityId: number | string,
): Promise<StravaActivityZone[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  try {
    const response = await stravaApi.get(`/activities/${activityId}/zones`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const validationResult = StravaActivityZonesResponseSchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getActivityZones: ${activityId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }

    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaActivityZone[]>(
      error,
      `getActivityZones(${activityId})`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getActivityZones(newToken, activityId);
      },
    );
  }
}

/**
 * Fetches photos associated with a specific activity.
 *
 * @param accessToken - The Strava API access token.
 * @param activityId - The ID of the activity to fetch photos for.
 * @param size - Size of photos to return in pixels (default: 2048). Required to get actual URLs instead of placeholders.
 * @returns A promise that resolves to an array of photos for the activity.
 * @throws Throws an error if the API request fails or the response format is unexpected.
 */
export async function getActivityPhotos(
  accessToken: string,
  activityId: number,
  size = 2048,
): Promise<StravaPhoto[]> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!activityId) {
    throw new Error("Activity ID is required to fetch photos.");
  }

  // photo_sources=true is required to get native Strava photos (not just Instagram)
  // size parameter is required to get actual URLs instead of placeholders
  const params: Record<string, string | number | boolean> = {
    photo_sources: true,
    size: size,
  };

  try {
    const response = await stravaApi.get<unknown>(
      `/activities/${activityId}/photos`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: params,
      },
    );

    const validationResult = StravaPhotosResponseSchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (getActivityPhotos: ${activityId}):`,
        JSON.stringify(validationResult.error.issues, null, 2),
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }

    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaPhoto[]>(
      error,
      `getActivityPhotos for ID ${activityId}`,
      async () => {
        // Use new token from environment after refresh
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return getActivityPhotos(newToken, activityId, size);
      },
    );
  }
}

/**
 * Updates an activity's mutable fields (name, description, sport type, gear,
 * and flags). Only provided fields are sent. Requires the activity:write scope.
 *
 * @param accessToken - The Strava API access token.
 * @param activityId - The ID of the activity to update.
 * @param updates - The mutable fields to apply. `description` must already be
 *   resolved (append composition happens in the tool layer).
 * @returns The updated detailed activity.
 */
export async function updateActivity(
  accessToken: string,
  activityId: number | string,
  updates: UpdateActivityParams,
): Promise<StravaDetailedActivity> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }
  if (!activityId) {
    throw new Error("Activity ID is required to update an activity.");
  }

  const body = buildUpdateActivityBody(updates);

  try {
    const response = await stravaApi.put<unknown>(
      `/activities/${activityId}`,
      body,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const validationResult = ExtendedDetailedActivitySchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        `Strava API validation failed (updateActivity: ${activityId}):`,
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedActivity>(
      error,
      `updateActivity for ID ${activityId}`,
      async () => {
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return updateActivity(newToken, activityId, updates);
      },
    );
  }
}

/**
 * Creates a manual activity (no device recording) on the authenticated
 * athlete's timeline. Requires the activity:write scope.
 *
 * @param accessToken - The Strava API access token.
 * @param params - The manual entry: name, sport type, local start time,
 *   elapsed time, and optional distance/description/flags.
 * @returns The created detailed activity.
 */
export async function createActivity(
  accessToken: string,
  params: CreateActivityParams,
): Promise<StravaDetailedActivity> {
  if (!accessToken) {
    throw new Error("Strava access token is required.");
  }

  const body = buildCreateActivityBody(params);

  try {
    const response = await stravaApi.post<unknown>("/activities", body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const validationResult = ExtendedDetailedActivitySchema.safeParse(
      response.data,
    );

    if (!validationResult.success) {
      console.error(
        "Strava API validation failed (createActivity):",
        validationResult.error,
      );
      throw new Error(
        `Invalid data format received from Strava API: ${validationResult.error.message}`,
      );
    }
    return validationResult.data;
  } catch (error) {
    return await handleApiError<StravaDetailedActivity>(
      error,
      `createActivity "${params.name}"`,
      async () => {
        const newToken = process.env.STRAVA_ACCESS_TOKEN!;
        return createActivity(newToken, params);
      },
    );
  }
}
