import { describe, expect, it } from "vitest";
import {
  READ_ONLY,
  VIEW,
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
  it("view tools do not touch the open world", () => {
    expect(VIEW.openWorldHint).toBe(false);
    expect(VIEW.readOnlyHint).toBe(true);
  });
});
