import { beforeEach, describe, expect, it, vi } from "vitest";
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
    mockedFetch.mockReset();
  });

  it("summarises photos and appends the raw JSON payload", async () => {
    mockedFetch.mockResolvedValueOnce([photo]);

    const result = await getActivityPhotosTool.execute(
      {
        id: "123",
        size: 600,
      },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith("test-token", "123", 600);
    const summary = result.content[0]?.text ?? "";
    expect(summary).toContain("Total Photos: 1");
    expect(summary).toContain("Source: Strava");
    expect(summary).toContain("Caption: Summit view");
    expect(summary).toContain("600: https://example.com/photo-600.jpg");
    const raw = result.content[1]?.text ?? "";
    expect(raw).toContain("Complete Photo Data");
    expect(JSON.parse(raw.slice(raw.indexOf("[")))).toHaveLength(1);
  });

  it("passes a 64-bit id through as digits rather than parsing it to a number", async () => {
    mockedFetch.mockResolvedValueOnce([photo]);

    const big = "3516039180561708486";
    await getActivityPhotosTool.execute({ id: big }, "test-token");

    expect(mockedFetch).toHaveBeenCalledWith("test-token", big, undefined);
  });

  it("rejects a non-numeric id at the schema, before execute runs", async () => {
    const parsed = getActivityPhotosTool.inputSchema.safeParse({
      id: "not-an-id",
    });

    expect(parsed.success).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("coerces a safe-integer number id to its digit string", () => {
    const parsed = getActivityPhotosTool.inputSchema.parse({ id: 123 });

    expect(parsed.id).toBe("123");
  });

  it("reports an empty photo list without an error flag", async () => {
    mockedFetch.mockResolvedValueOnce([]);

    const result = await getActivityPhotosTool.execute(
      { id: "123" },
      "test-token",
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "No photos found for activity ID: 123",
    );
  });

  it("maps a 404 to an activity-not-found message", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Record Not Found"));

    const result = await getActivityPhotosTool.execute(
      { id: "123" },
      "test-token",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Activity with ID 123 not found");
  });
});
