import { describe, expect, it } from "vitest";
import { computeBranchSegments } from "./branchSegments";
import type { CommitNode } from "./types";

function commit(hash: string, refs: string[] = []): CommitNode {
  return { hash, parents: [], refs, subject: hash, body: "", author: "a", date: "2026-01-01T00:00:00Z" };
}

describe("computeBranchSegments", () => {
  it("labels a run of commits with the branch whose tip closes it", () => {
    // Newest first, like the backend returns them.
    const commits = [
      commit("head"),
      commit("c3", ["feature/v2"]),
      commit("c2"),
      commit("c1", ["feature/v1"]),
      commit("root"),
    ];
    const labels = computeBranchSegments(commits, ["feature/v1", "feature/v2"]);

    expect(labels.get("c1")).toBe("feature/v1");
    expect(labels.get("root")).toBe("feature/v1");
    expect(labels.get("c2")).toBe("feature/v2");
    expect(labels.get("c3")).toBe("feature/v2");
    expect(labels.has("head")).toBe(false);
  });

  it("leaves commits after the last surviving tip unlabeled", () => {
    const commits = [commit("newest"), commit("tip", ["feature/v1"]), commit("older")];
    const labels = computeBranchSegments(commits, ["feature/v1"]);

    expect(labels.has("newest")).toBe(false);
    expect(labels.get("tip")).toBe("feature/v1");
    expect(labels.get("older")).toBe("feature/v1");
  });

  it("ignores refs that aren't in the known branch list", () => {
    const commits = [commit("a", ["origin/main", "tag: v1.0.0"]), commit("b")];
    const labels = computeBranchSegments(commits, ["feature/v1"]);
    expect(labels.size).toBe(0);
  });

  it("returns no labels when there are no matching branch tips at all", () => {
    const commits = [commit("a"), commit("b"), commit("c")];
    expect(computeBranchSegments(commits, ["feature/v1"]).size).toBe(0);
  });

  it("handles an empty commit list", () => {
    expect(computeBranchSegments([], ["feature/v1"]).size).toBe(0);
  });
});
