import { describe, expect, it } from "vitest";
import { computeBranchSegments } from "./branchSegments";
import type { CommitNode } from "./types";

function commit(hash: string, parents: string[] = [], refs: string[] = []): CommitNode {
  return { hash, parents, refs, subject: hash, body: "", author: "a", date: "2026-01-01T00:00:00Z" };
}

describe("computeBranchSegments", () => {
  it("labels a branch's own commits, diverged from the current tip", () => {
    // root -> m1 (HEAD -> main); root -> m1 -> f1 -> f2 (feature/v1), never merged.
    const commits = [
      commit("head", ["m1"], ["HEAD -> main"]),
      commit("f2", ["f1"], ["feature/v1"]),
      commit("f1", ["m1"]),
      commit("m1", ["root"]),
      commit("root", []),
    ];
    const labels = computeBranchSegments(commits, ["feature/v1"]);

    expect(labels.get("f1")).toBe("feature/v1");
    expect(labels.get("f2")).toBe("feature/v1");
    expect(labels.has("m1")).toBe(false);
    expect(labels.has("root")).toBe(false);
    expect(labels.has("head")).toBe(false);
  });

  it("doesn't credit an unrelated branch with history it merely shares via a merge commit", () => {
    // root -> a1 -> a2 (side branch, no surviving ref)
    // root -> m1 -> merge(m1, a2) -> m2 -> m3 (HEAD -> main)
    // merge -> b1 -> b2 (feature/beta), branched off *after* the merge, never merged back.
    // b2 should only ever be credited with its own 2 commits, not the merge's
    // entire ancestry (root/a1/a2/m1/merge) — that's what regressed before.
    const commits = [
      commit("m3", ["m2"], ["HEAD -> main"]),
      commit("m2", ["merge"]),
      commit("b2", ["b1"], ["feature/beta"]),
      commit("b1", ["merge"]),
      commit("merge", ["m1", "a2"]),
      commit("a2", ["a1"]),
      commit("a1", ["root"]),
      commit("m1", ["root"]),
      commit("root", []),
    ];
    const labels = computeBranchSegments(commits, ["feature/beta"]);

    expect(labels.get("b1")).toBe("feature/beta");
    expect(labels.get("b2")).toBe("feature/beta");
    expect(labels.size).toBe(2);
  });

  it("leaves a commit unlabeled when two sibling branches equally share it", () => {
    // root -> s -> a1 -> a2 (feature/a)
    //           -> b1 -> b2 (feature/b)
    // main branches directly from root, never incorporating s — so s (and
    // everything on either branch up to their actual split) is equally
    // "unique-relative-to-mainline" ancestry for both feature/a and
    // feature/b. Neither branch should win it by array-order coincidence.
    const commits = [
      commit("m1", ["root"], ["HEAD -> main"]),
      commit("a2", ["a1"], ["feature/a"]),
      commit("a1", ["s"]),
      commit("b2", ["b1"], ["feature/b"]),
      commit("b1", ["s"]),
      commit("s", ["root"]),
      commit("root", []),
    ];
    const labels = computeBranchSegments(commits, ["feature/a", "feature/b"]);

    expect(labels.get("a1")).toBe("feature/a");
    expect(labels.get("a2")).toBe("feature/a");
    expect(labels.get("b1")).toBe("feature/b");
    expect(labels.get("b2")).toBe("feature/b");
    expect(labels.has("s")).toBe(false);
    expect(labels.has("root")).toBe(false);
  });

  it("leaves a fast-forward-merged branch's now-shared history unlabeled", () => {
    // A branch ref lingering on a commit that's now just a plain ancestor of
    // HEAD (fast-forwarded, no merge commit) has nothing left unique to it.
    const commits = [
      commit("head", ["tip"], ["HEAD -> main"]),
      commit("tip", ["older"], ["feature/v1"]),
      commit("older", []),
    ];
    const labels = computeBranchSegments(commits, ["feature/v1"]);
    expect(labels.size).toBe(0);
  });

  it("ignores refs that aren't in the known branch list", () => {
    const commits = [commit("a", [], ["origin/main", "tag: v1.0.0"]), commit("b", ["a"])];
    const labels = computeBranchSegments(commits, ["feature/v1"]);
    expect(labels.size).toBe(0);
  });

  it("returns no labels when there are no matching branch tips at all", () => {
    const commits = [commit("a"), commit("b", ["a"]), commit("c", ["b"])];
    expect(computeBranchSegments(commits, ["feature/v1"]).size).toBe(0);
  });

  it("handles an empty commit list", () => {
    expect(computeBranchSegments([], ["feature/v1"]).size).toBe(0);
  });
});
