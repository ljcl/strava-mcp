import { describe, expect, it } from "vitest";
import { HttpError, parseJsonWithLargeInts } from "./fetchClient";

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
