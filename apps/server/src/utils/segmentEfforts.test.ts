import { describe, expect, it } from "vitest";
import * as fixtures from "../__fixtures__";
import { processSegmentEfforts, summarizeAchievements } from "./segmentEfforts";

const efforts = fixtures.activityWithSegmentEfforts.segment_efforts;

describe("summarizeAchievements", () => {
  it("counts PRs, top-10s, and total", () => {
    expect(summarizeAchievements(efforts)).toEqual({
      total: 3,
      prCount: 1,
      topTenCount: 1,
    });
  });

  it("returns zeroes for an empty list", () => {
    expect(summarizeAchievements([])).toEqual({
      total: 0,
      prCount: 0,
      topTenCount: 0,
    });
  });
});

describe("processSegmentEfforts", () => {
  it("labels achievements and sorts PRs first", () => {
    const result = processSegmentEfforts(efforts);
    expect(result.efforts.map((e) => e.segmentName)).toEqual([
      "Riverside Sprint", // pr_rank 1
      "Bridge Climb", // pr_rank 2
      "Park Loop", // no rank
    ]);
    const [first, second, third] = result.efforts;
    expect(first?.achievement).toBe("PR, Top 10 (#8)");
    expect(second?.achievement).toBe("2nd best");
    expect(third?.achievement).toBeNull();
  });

  it("labels a PR that is not also a top-10 as just the PR", () => {
    const riverside = efforts[0]!;
    const prOnly = [{ ...riverside, pr_rank: 1, kom_rank: null }];
    const result = processSegmentEfforts(prOnly);
    const [first] = result.efforts;
    expect(first?.achievement).toBe("PR");
  });

  it("labels a top-10 effort that is not a PR", () => {
    const parkLoop = efforts[1]!;
    const onlyKom = [{ ...parkLoop, pr_rank: null, kom_rank: 5 }];
    const result = processSegmentEfforts(onlyKom);
    const [first] = result.efforts;
    expect(first?.achievement).toBe("Top 10 (#5)");
  });
});
