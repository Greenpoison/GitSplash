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

/// Once a branch is fast-forward merged, its commits become indistinguishable
/// from "always been on main" by git's object graph alone — there's no merge
/// commit recording that boundary. But if the branch ref itself hasn't been
/// deleted, its tip is still decorated on exactly the commit where that
/// branch's work stopped. Walking the (topologically ordered) commit list
/// oldest-to-newest and buffering commits since the last such tip lets us
/// retroactively reconstruct "this run of commits belonged to branch X" for
/// every branch whose ref still exists — without needing a merge commit at
/// all. Commits after the last surviving tip (i.e. on the branch you're
/// currently working on) are left unlabeled.
export function computeBranchSegments(
  commits: CommitNode[],
  branchNames: string[],
): Map<string, string> {
  const known = new Set(branchNames);
  const labels = new Map<string, string>();
  const buffer: string[] = [];

  for (let i = commits.length - 1; i >= 0; i--) {
    const commit = commits[i];
    buffer.push(commit.hash);
    const tipBranch = commit.refs.find((r) => known.has(r));
    if (tipBranch) {
      for (const hash of buffer) labels.set(hash, tipBranch);
      buffer.length = 0;
    }
  }

  return labels;
}
