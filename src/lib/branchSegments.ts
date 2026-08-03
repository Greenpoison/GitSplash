import type { CommitNode } from "./types";

const SEGMENT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/// Deterministic so the same branch always gets the same color across
/// reloads/re-renders, regardless of render order.
export function colorForBranchName(name: string): string {
  let sum = 0;
  for (const c of name) sum += c.charCodeAt(0);
  return SEGMENT_COLORS[sum % SEGMENT_COLORS.length];
}

function ancestorsOf(byHash: Map<string, CommitNode>, tip: string): Set<string> {
  const seen = new Set<string>();
  const queue = [tip];
  while (queue.length > 0) {
    const hash = queue.shift()!;
    if (seen.has(hash)) continue;
    seen.add(hash);
    for (const parent of byHash.get(hash)?.parents ?? []) {
      if (byHash.has(parent) && !seen.has(parent)) queue.push(parent);
    }
  }
  return seen;
}

/// For each named branch, labels the commits reachable from its tip that
/// AREN'T also reachable from the current tip — i.e. exactly the commits
/// `git log HEAD..branch` would show, the part of that branch's history
/// that's actually its own rather than shared/already-mainline. Walking
/// real parent links (rather than a flat "buffer since the last recognized
/// ref" pass over the list) is what makes this safe once there's any real
/// branching in the history: a merge commit's ancestry is shared by
/// everything downstream of it, so a naive proximity-based scan can end up
/// crediting one branch with another, unrelated branch's entire history
/// just because it happens to be the next tip encountered.
///
/// Deliberate trade-off: a branch that was fast-forward merged (no merge
/// commit, its ref just lingering on what's now indistinguishable from
/// plain mainline history) ends up with nothing left to label, since none
/// of its commits are actually unique anymore. The old version retroactively
/// recolored that stretch anyway; this doesn't, in exchange for never
/// mislabeling an unrelated branch's history as belonging to something else.
export function computeBranchSegments(
  commits: CommitNode[],
  branchNames: string[],
): Map<string, string> {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const labels = new Map<string, string>();
  if (commits.length === 0) return labels;

  const currentTip = commits.find((c) => c.refs.some((r) => r === "HEAD" || r.startsWith("HEAD -> ")));
  const mainline = ancestorsOf(byHash, (currentTip ?? commits[0]).hash);

  for (const name of branchNames) {
    const tip = commits.find((c) => c.refs.includes(name));
    if (!tip) continue;
    for (const hash of ancestorsOf(byHash, tip.hash)) {
      if (!mainline.has(hash) && !labels.has(hash)) labels.set(hash, name);
    }
  }

  return labels;
}
