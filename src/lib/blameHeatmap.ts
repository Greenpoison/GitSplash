const BUCKETS: { maxDays: number; color: string }[] = [
  { maxDays: 7, color: "#ef4444" }, // red-500 — changed this week
  { maxDays: 30, color: "#fb923c" }, // orange-400 — this month
  { maxDays: 180, color: "#facc15" }, // yellow-400 — this half-year
  { maxDays: 365, color: "#38bdf8" }, // sky-400 — this year
];
const OLDEST_COLOR = "#64748b"; // slate-500 — older than a year

/// A blame heatmap convention (GitHub, GitLens, etc.): recently-changed
/// lines run warm (red), untouched-in-ages lines run cool (slate), so you
/// can spot the "hot" parts of a file at a glance instead of reading every
/// date. Discrete buckets rather than a continuous gradient, since the
/// exact day-count rarely matters as much as "roughly how stale is this."
export function colorForAge(authorTime: string, now: number = Date.now()): string {
  const then = new Date(authorTime).getTime();
  if (Number.isNaN(then)) return OLDEST_COLOR;
  const ageDays = (now - then) / (1000 * 60 * 60 * 24);
  for (const bucket of BUCKETS) {
    if (ageDays <= bucket.maxDays) return bucket.color;
  }
  return OLDEST_COLOR;
}
