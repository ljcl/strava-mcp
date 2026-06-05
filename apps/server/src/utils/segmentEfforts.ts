import { type StravaDetailedSegmentEffort } from "../stravaClient";

export interface AchievementSummary {
  total: number;
  prCount: number;
  topTenCount: number;
}

export interface ProcessedEffort {
  segmentName: string;
  elapsedTime: number;
  distance: number;
  prRank: number | null;
  komRank: number | null;
  achievement: string | null;
}

export interface ProcessedSegmentEfforts extends AchievementSummary {
  efforts: ProcessedEffort[];
}

type EffortLike = Pick<
  StravaDetailedSegmentEffort,
  "name" | "elapsed_time" | "distance" | "pr_rank" | "kom_rank"
>;

/** Counts true PRs (pr_rank === 1), top-10 leaderboard ranks, and total efforts. */
export function summarizeAchievements(
  efforts: EffortLike[],
): AchievementSummary {
  let prCount = 0;
  let topTenCount = 0;
  for (const e of efforts) {
    if (e.pr_rank === 1) prCount += 1;
    if (e.kom_rank != null) topTenCount += 1;
  }
  return { total: efforts.length, prCount, topTenCount };
}

function achievementLabel(
  prRank: number | null | undefined,
  komRank: number | null | undefined,
): string | null {
  // An effort can be both a personal best and a top-10 leaderboard placing.
  // Surface both so the line matches the summary counts.
  const parts: string[] = [];
  if (prRank === 1) parts.push("PR");
  else if (prRank === 2) parts.push("2nd best");
  else if (prRank === 3) parts.push("3rd best");
  if (komRank != null) parts.push(`Top 10 (#${komRank})`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function tier(e: EffortLike): number {
  if (e.pr_rank != null) return 0;
  if (e.kom_rank != null) return 1;
  return 2;
}

function rankWithinTier(e: EffortLike): number {
  if (e.pr_rank != null) return e.pr_rank;
  if (e.kom_rank != null) return e.kom_rank;
  return 0;
}

/**
 * Sorts efforts so achievements surface first (PRs, then top-10s, then the
 * rest in original order) and attaches a human-readable achievement label.
 * Relies on stable sort to preserve original order within the "rest" tier.
 */
export function processSegmentEfforts(
  efforts: EffortLike[],
): ProcessedSegmentEfforts {
  const sorted = [...efforts].sort((a, b) => {
    const tierDiff = tier(a) - tier(b);
    if (tierDiff !== 0) return tierDiff;
    return rankWithinTier(a) - rankWithinTier(b);
  });

  const processed: ProcessedEffort[] = sorted.map((e) => ({
    segmentName: e.name,
    elapsedTime: e.elapsed_time,
    distance: e.distance,
    prRank: e.pr_rank ?? null,
    komRank: e.kom_rank ?? null,
    achievement: achievementLabel(e.pr_rank, e.kom_rank),
  }));

  return { ...summarizeAchievements(efforts), efforts: processed };
}
