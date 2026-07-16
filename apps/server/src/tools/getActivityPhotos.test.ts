import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityPhotos as getActivityPhotosClient,
  type StravaPhoto,
} from "../stravaClient";
import { getActivityPhotosTool } from "./getActivityPhotos";

vi.mock("../stravaClient", () => ({
  getActivityPhotos: vi.fn(),
}));

const mockedFetch = vi.mocked(getActivityPhotosClient);

const photo = {
  id: 111,
  unique_id: "abc-123",
  source: 1,
  caption: "Summit view",
  location: [51.5074, -0.1278],
  created_at: "2026-06-01T09:00:00Z",
  urls: { "600": "https://example.com/photo-600.jpg" },
} as unknown as StravaPhoto;

describe("get-activity-photos execute", () => {
  beforeEach(() => {
    process.env.STRAVA_ACCESS_TOKEN = "test-token";
    mockedFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.STRAVA_ACCESS_TOKEN;
  });

  it("summarises photos and appends the raw JSON payload", async () => {
    mockedFetch.mockResolvedValueOnce([photo]);

    const result = await getActivityPhotosTool.execute({ id: 123, size: 600 });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", 123, 600);
    const summary = result.content[0]?.text ?? "";
    expect(summary).toContain("Total Photos: 1");
    expect(summary).toContain("Source: Strava");
    expect(summary).toContain("Caption: Summit view");
    expect(summary).toContain("600: https://example.com/photo-600.jpg");
    const raw = result.content[1]?.text ?? "";
    expect(raw).toContain("Complete Photo Data");
    expect(JSON.parse(raw.slice(raw.indexOf("[")))).toHaveLength(1);
  });

  it("accepts a string activity id", async () => {
    mockedFetch.mockResolvedValueOnce([photo]);

    const result = await getActivityPhotosTool.execute({ id: "123" });

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", 123, undefined);
  });

  it("rejects a non-numeric string id without calling Strava", async () => {
    const result = await getActivityPhotosTool.execute({ id: "not-an-id" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid activity ID");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("reports an empty photo list without an error flag", async () => {
    mockedFetch.mockResolvedValueOnce([]);

    const result = await getActivityPhotosTool.execute({ id: 123 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "No photos found for activity ID: 123",
    );
  });

  it("maps a 404 to an activity-not-found message", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await getActivityPhotosTool.execute({ id: 123 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Activity with ID 123 not found");
  });

  it("returns a configuration error without a token", async () => {
    delete process.env.STRAVA_ACCESS_TOKEN;

    const result = await getActivityPhotosTool.execute({ id: 123 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Missing Strava access token");
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
