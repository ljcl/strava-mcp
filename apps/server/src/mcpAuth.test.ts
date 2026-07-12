import { afterEach, describe, expect, it } from "vitest";
import { unauthorizedMcpResponse } from "./mcpAuth";

const request = (authorization?: string) =>
  new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("unauthorizedMcpResponse", () => {
  afterEach(() => {
    delete process.env.MCP_AUTH_TOKEN;
  });

  it("allows everything when MCP_AUTH_TOKEN is unset (behaviour unchanged)", () => {
    expect(unauthorizedMcpResponse(request())).toBeNull();
    expect(unauthorizedMcpResponse(request("Bearer anything"))).toBeNull();
  });

  it("rejects requests without an Authorization header", async () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    const denied = unauthorizedMcpResponse(request());

    expect(denied?.status).toBe(401);
    expect(denied?.headers.get("WWW-Authenticate")).toContain("Bearer");
    const body = await denied?.json();
    expect(body.error.message).toBe("Unauthorized");
  });

  it("rejects a wrong token", () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    expect(unauthorizedMcpResponse(request("Bearer nope"))?.status).toBe(401);
  });

  it("rejects a non-Bearer scheme carrying the right value", () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    expect(unauthorizedMcpResponse(request("Basic s3cret"))?.status).toBe(401);
  });

  it("allows the configured token", () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    expect(unauthorizedMcpResponse(request("Bearer s3cret"))).toBeNull();
  });

  it("accepts a case-insensitive Bearer scheme", () => {
    process.env.MCP_AUTH_TOKEN = "s3cret";

    expect(unauthorizedMcpResponse(request("bearer s3cret"))).toBeNull();
  });
});
