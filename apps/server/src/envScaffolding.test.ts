/**
 * The token-resolution convention (#301).
 *
 * Token resolution is centralised (#240): `dispatchToolCall` resolves the
 * access token once per call and passes it to the handler as its second
 * argument, so `tokenManager` is the only module that reads or writes
 * `process.env.STRAVA_ACCESS_TOKEN`. Twenty-six test files went on setting it
 * in `beforeEach` and deleting it in `afterEach` long after the last tool
 * stopped reading it — scaffolding that asserted a coupling which no longer
 * exists, and that reads as an invitation for the next test to depend on the
 * env var instead of passing a token to `execute`.
 *
 * Deleting it once only fixes today. This guard makes the convention hold:
 * any new mention outside `tokenManager` fails here, naming the file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

/** Anchored on this file rather than cwd, the way `toolSurface.test.ts` is. */
const SRC_DIR = new URL(".", import.meta.url);

const NEEDLE = "process.env.STRAVA_ACCESS_TOKEN";

/**
 * `tokenManager.ts` owns the variable — storing the token there is how the
 * OAuth half hands it to the rest of the server — and `tokenManager.test.ts`
 * is what proves that ownership. This file holds the needle as a literal, so
 * without the third entry it would report itself as the offender.
 */
const ALLOWED = new Set([
  "tokenManager.ts",
  "tokenManager.test.ts",
  "envScaffolding.test.ts",
]);

/**
 * Comments are stripped before matching. `server.ts` explains the convention
 * in prose above `dispatchToolCall`, and documenting a rule must not force the
 * repo's largest file onto the allowlist that exempts it from the rule.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => entry.endsWith(".ts"));
}

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, SRC_DIR), "utf8");
}

describe("STRAVA_ACCESS_TOKEN scaffolding", () => {
  it("is confined to tokenManager", () => {
    const files = sourceFiles();
    // A readdir that quietly found nothing would pass this test vacuously.
    expect(files.length).toBeGreaterThan(100);

    const offenders = files
      .filter((file) => !ALLOWED.has(basename(file)))
      .filter((file) => stripComments(readSource(file)).includes(NEEDLE))
      .map((file) => `apps/server/src/${file}`);

    expect(offenders).toEqual([]);
  });

  it("still matches tokenManager, so a rename cannot turn this into a no-op", () => {
    expect(stripComments(readSource("tokenManager.ts"))).toContain(NEEDLE);
  });
});
