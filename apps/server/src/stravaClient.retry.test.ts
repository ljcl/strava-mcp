import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError, stravaApi } from "./fetchClient";
import {
  exploreSegments,
  getActivityStreams,
  getSegmentEffort,
} from "./stravaClient";
import { refreshAccessToken } from "./tokenManager";

vi.mock("./fetchClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchClient")>();
  return {
    ...actual,
    stravaApi: { get: vi.fn(), put: vi.fn() },
  };
});

vi.mock("./tokenManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenManager")>();
  return {
    ...actual,
    refreshAccessToken: vi.fn(),
  };
});

const mockedGet = vi.mocked(stravaApi.get);
const mockedRefresh = vi.mocked(refreshAccessToken);

const unauthorized = () =>
  new HttpError("Strava API Error (401): Authorization Error", {
    status: 401,
    statusText: "Unauthorized",
    data: '{"message":"Authorization Error"}',
  });

const bounds = "51.25,-0.32,51.27,-0.30";

describe("401 refresh-retry", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedRefresh.mockReset();
    mockedRefresh.mockImplementation(async () => {
      return {
        access_token: "refreshed-token",
        refresh_token: "refreshed-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
    });
  });

  it("retries exploreSegments once with all original filters preserved", async () => {
    mockedGet
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce({ data: { segments: [] } });

    const result = await exploreSegments("stale-token", bounds, "riding", 1, 5);

    expect(result).toEqual({ segments: [] });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    // Regression (#112): the retry used to drop minCat/maxCat.
    expect(mockedGet).toHaveBeenLastCalledWith("/segments/explore", {
      headers: { Authorization: "Bearer refreshed-token" },
      params: {
        bounds,
        activity_type: "riding",
        min_cat: 1,
        max_cat: 5,
      },
    });
  });

  it("fails after one refresh attempt when the 401 persists", async () => {
    // A scope-stripped token refreshes successfully but keeps returning 401;
    // this must terminate instead of looping refresh+request forever.
    mockedGet.mockRejectedValue(unauthorized());

    await expect(
      exploreSegments("stale-token", bounds, "riding", 1, 5),
    ).rejects.toThrow(/401/);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("refreshes and retries a stream fetch, which used to swallow the 401", async () => {
    // #237: the seven local stream fetchers called stravaApi.get behind a bare
    // `catch {}`, so an expired token never reached the refresh path at all.
    mockedGet.mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce({
      data: [{ type: "time", data: [0, 1, 2] }],
    });

    const streams = await getActivityStreams("stale-token", "123", ["time"]);

    expect(streams.get("time")).toEqual([0, 1, 2]);
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenLastCalledWith("/activities/123/streams/time", {
      headers: { Authorization: "Bearer refreshed-token" },
    });
  });

  it("passes a string effort id above 2^53 through to the request untouched", async () => {
    const bigEffortId = "3503400000123456789";
    mockedGet.mockRejectedValue(unauthorized());

    await expect(
      getSegmentEffort("stale-token", bigEffortId),
    ).rejects.toThrow();

    expect(mockedGet).toHaveBeenCalledWith(
      `/segment_efforts/${bigEffortId}`,
      expect.anything(),
    );
  });
});
