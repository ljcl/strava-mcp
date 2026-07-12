/**
 * Aggregate per-package vitest coverage into one markdown table (#135).
 * CI appends the output to $GITHUB_STEP_SUMMARY after `turbo run
 * test:coverage`, so coverage is visible at review time without
 * downloading artifacts. Packages without a coverage-summary.json (no
 * tests, or coverage not run) are simply absent from the table.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface CoverageTotals {
  statements: { pct: number };
  branches: { pct: number };
  functions: { pct: number };
  lines: { pct: number };
}

const rows: string[] = [];
for (const root of ["apps", "packages"]) {
  for (const dir of readdirSync(root).sort()) {
    const file = join(root, dir, "coverage", "coverage-summary.json");
    if (!existsSync(file)) continue;
    const total = (
      JSON.parse(readFileSync(file, "utf-8")) as { total: CoverageTotals }
    ).total;
    rows.push(
      `| \`${root}/${dir}\` | ${total.statements.pct}% | ${total.branches.pct}% | ${total.functions.pct}% | ${total.lines.pct}% |`,
    );
  }
}

console.log("## Test coverage");
console.log("");
console.log("| Package | Statements | Branches | Functions | Lines |");
console.log("| ------- | ---------- | -------- | --------- | ----- |");
console.log(rows.join("\n") || "| _no coverage data found_ | – | – | – | – |");
