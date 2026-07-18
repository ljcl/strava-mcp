import { describe, expect, it } from "vitest";
import { z } from "zod";
import { stravaIdInput } from "./_ids";

describe("stravaIdInput", () => {
  const schema = stravaIdInput("The id.");

  it("accepts a digit string", () => {
    expect(schema.parse("12345")).toBe("12345");
  });

  it("accepts an id above 2^53 as a string (lossless)", () => {
    const big = "3512771082082480078";
    expect(schema.parse(big)).toBe(big);
  });

  it("accepts a bare safe-integer number and coerces it to a digit string", () => {
    // Route and activity ids sit well below 2^53, so a host or model sending
    // `route_id: 12345` must not be trapped in the string-only failure path.
    expect(schema.parse(12345)).toBe("12345");
  });

  it("rejects a number that is not a safe integer so oversized ids cannot be silently corrupted", () => {
    // Such a value has already been rounded by the host's JSON.parse before
    // validation runs; failing loudly steers the caller to the string form.
    expect(() => schema.parse(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it("rejects non-integer and negative numbers", () => {
    expect(() => schema.parse(12.5)).toThrow();
    expect(() => schema.parse(-5)).toThrow();
  });

  it("rejects non-digit strings", () => {
    expect(() => schema.parse("12ab")).toThrow();
    expect(() => schema.parse("")).toThrow();
    expect(() => schema.parse("-5")).toThrow();
  });

  it("advertises both a string and a number branch in the JSON schema", () => {
    // The server advertises input schemas with `io: "input"` so the accepted
    // (pre-coercion) shape is what hosts see.
    const json = z.toJSONSchema(schema, { io: "input" }) as {
      type?: string;
      anyOf?: Array<{ type?: string; pattern?: string }>;
    };
    expect(json.anyOf).toBeDefined();
    const stringBranch = json.anyOf?.find((b) => b.type === "string");
    const numberBranch = json.anyOf?.find(
      (b) => b.type === "number" || b.type === "integer",
    );
    expect(stringBranch?.pattern).toBe("^\\d+$");
    expect(numberBranch).toBeDefined();
  });
});
