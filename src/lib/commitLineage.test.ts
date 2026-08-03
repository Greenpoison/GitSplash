import { describe, expect, it } from "vitest";
import { traceLineage } from "./commitLineage";
import type { CommitNode } from "./types";

function commit(hash: string, parents: string[]): CommitNode {
  return { hash, parents, refs: [], subject: hash, body: "", author: "Alice", date: "2026-01-01T00:00:00Z" };
}

describe("traceLineage", () => {
  it("includes the commit itself even with no parents or children", () => {
    const commits = [commit("a", [])];
    expect(traceLineage(commits, "a")).toEqual(new Set(["a"]));
  });

  it("walks straight-line ancestors and descendants", () => {
    // a -> b -> c -> d (d is newest, a is oldest)
    const commits = [commit("d", ["c"]), commit("c", ["b"]), commit("b", ["a"]), commit("a", [])];
    expect(traceLineage(commits, "b")).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("follows both sides of a merge for ancestors", () => {
    // a and b both merge into m
    const commits = [commit("m", ["a", "b"]), commit("a", []), commit("b", [])];
    expect(traceLineage(commits, "m")).toEqual(new Set(["m", "a", "b"]));
  });

  it("follows descendants across a branch that merges back in", () => {
    // main: a -> m (merges feature branch f, which itself branched from a)
    const commits = [commit("m", ["a", "f"]), commit("f", ["a"]), commit("a", [])];
    expect(traceLineage(commits, "a")).toEqual(new Set(["a", "f", "m"]));
  });

  it("does not cross into an unrelated branch", () => {
    const commits = [commit("a", []), commit("b", [])];
    expect(traceLineage(commits, "a")).toEqual(new Set(["a"]));
  });

  it("returns an empty set for a hash not in the commit list", () => {
    const commits = [commit("a", [])];
    expect(traceLineage(commits, "missing")).toEqual(new Set());
  });
});
