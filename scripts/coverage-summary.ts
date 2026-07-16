/**
 * Aggregate per-package vitest coverage into one markdown table (#135).
 * CI appends the output to $GITHUB_STEP_SUMMARY after `turbo run
 * test:coverage`, so coverage is visible at review time without
 * downloading artifacts. Packages without a coverage-summary.json (no
 * tests, or coverage not run) are simply absent from the table. The story
 * smoke tests contribute a separate render-path row (#197) from the
 * root-level coverage-stories/ report — kept distinct from the unit rows
 * because it spans every packages/* source at once.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface CoverageTotals {
  statements: { pct: number };
  branches: { pct: number };
  functions: { pct: number };
  lines: { pct: number };
}

function totalsRow(label: string, file: string): string | null {
  if (!existsSync(file)) return null;
  const total = (
    JSON.parse(readFileSync(file, "utf-8")) as { total: CoverageTotals }
  ).total;
  return `| ${label} | ${total.statements.pct}% | ${total.branches.pct}% | ${total.functions.pct}% | ${total.lines.pct}% |`;
}

const rows: string[] = [];
for (const root of ["apps", "packages"]) {
  for (const dir of readdirSync(root).sort()) {
    const row = totalsRow(
      `\`${root}/${dir}\``,
      join(root, dir, "coverage", "coverage-summary.json"),
    );
    if (row) rows.push(row);
  }
}

const storyRow = totalsRow(
  "_stories (render-path, all packages)_",
  join("coverage-stories", "coverage-summary.json"),
);
if (storyRow) rows.push(storyRow);

console.log("## Test coverage");
console.log("");
console.log("| Package | Statements | Branches | Functions | Lines |");
console.log("| ------- | ---------- | -------- | --------- | ----- |");
console.log(rows.join("\n") || "| _no coverage data found_ | – | – | – | – |");
