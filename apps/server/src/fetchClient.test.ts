import { describe, expect, it } from "vitest";
import { HttpError } from "./fetchClient";

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
