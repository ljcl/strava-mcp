import { describe, expect, it } from "vitest";
import { TOOLS } from "./server";
import {
  READ_ONLY,
  WRITE_DESTRUCTIVE,
  WRITE_IDEMPOTENT,
} from "./tools/_annotations";

describe("annotation constants", () => {
  it("read-only is honest", () => {
    expect(READ_ONLY.readOnlyHint).toBe(true);
    expect(READ_ONLY.openWorldHint).toBe(true);
  });
  it("update-activity is destructive and non-idempotent", () => {
    expect(WRITE_DESTRUCTIVE.destructiveHint).toBe(true);
    expect(WRITE_DESTRUCTIVE.idempotentHint).toBe(false);
    expect(WRITE_DESTRUCTIVE.readOnlyHint).toBe(false);
  });
  it("idempotent writes are not destructive", () => {
    expect(WRITE_IDEMPOTENT.idempotentHint).toBe(true);
    expect(WRITE_IDEMPOTENT.destructiveHint).toBe(false);
  });
});

describe("tool annotations exhaustiveness", () => {
  it("every tool in TOOLS carries an annotations object", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    for (const tool of TOOLS) {
      expect(
        tool.annotations,
        `${tool.name} is missing annotations`,
      ).toBeDefined();
    }
  });
});
