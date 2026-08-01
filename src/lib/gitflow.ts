import type { GitflowKind } from "./types";

export const GITFLOW_DEFAULT_BASE: Record<GitflowKind, string> = {
  feature: "develop",
  release: "develop",
  hotfix: "main",
};

export const GITFLOW_DEFAULT_TARGETS: Record<GitflowKind, string[]> = {
  feature: ["develop"],
  release: ["main", "develop"],
  hotfix: ["main", "develop"],
};

export function parseGitflowBranch(name: string): { kind: GitflowKind; branchName: string } | null {
  const match = /^(feature|release|hotfix)\/(.+)$/.exec(name);
  if (!match) return null;
  return { kind: match[1] as GitflowKind, branchName: match[2] };
}
