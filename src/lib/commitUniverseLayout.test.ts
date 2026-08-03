import { describe, expect, it } from "vitest";
import { computeUniverseLayout } from "./commitUniverseLayout";
import type { CommitNode } from "./types";

function commit(hash: string, parents: string[]): CommitNode {
  return { hash, parents, refs: [], subject: hash, body: "", author: "Alice", date: "2026-01-01T00:00:00Z" };
}

describe("computeUniverseLayout", () => {
  it("places every commit at a finite position", () => {
    const commits = [commit("c", ["b"]), commit("b", ["a"]), commit("a", [])];
    const { positions } = computeUniverseLayout(commits);
    expect(positions.size).toBe(3);
    for (const hash of ["a", "b", "c"]) {
      const p = positions.get(hash);
      expect(p).toBeDefined();
      expect(Number.isFinite(p!.x)).toBe(true);
      expect(Number.isFinite(p!.y)).toBe(true);
    }
  });

  it("only links parents that are actually in the commit list", () => {
    const commits = [commit("b", ["a", "missing-parent"]), commit("a", [])];
    const { links } = computeUniverseLayout(commits);
    expect(links).toEqual([{ source: "b", target: "a" }]);
  });

  it("returns no links for a set of unrelated root commits", () => {
    const commits = [commit("a", []), commit("b", [])];
    const { links } = computeUniverseLayout(commits);
    expect(links).toEqual([]);
  });
});
