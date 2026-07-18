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

  it("rejects a bare number so hosts cannot take a precision-losing branch", () => {
    // A JSON number is the path where JSON.parse rounds oversized ids before
    // validation; the schema must not advertise or accept it.
    expect(() => schema.parse(12345)).toThrow();
  });

  it("rejects non-digit strings", () => {
    expect(() => schema.parse("12ab")).toThrow();
    expect(() => schema.parse("")).toThrow();
    expect(() => schema.parse("-5")).toThrow();
  });

  it("advertises a string-only JSON schema with no integer branch", () => {
    const json = z.toJSONSchema(schema) as {
      type?: string;
      anyOf?: unknown[];
      pattern?: string;
    };
    expect(json.type).toBe("string");
    expect(json.anyOf).toBeUndefined();
    expect(json.pattern).toBe("^\\d+$");
  });
});
