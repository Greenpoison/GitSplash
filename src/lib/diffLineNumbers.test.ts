import { describe, expect, it } from "vitest";
import { computeLineNumbers, parseHunkHeader } from "./diffLineNumbers";

describe("parseHunkHeader", () => {
  it("parses a header with explicit counts", () => {
    expect(parseHunkHeader("@@ -12,5 +14,7 @@")).toEqual({ oldStart: 12, newStart: 14 });
  });

  it("parses a header with implicit single-line counts", () => {
    expect(parseHunkHeader("@@ -12 +14 @@")).toEqual({ oldStart: 12, newStart: 14 });
  });

  it("parses a header with trailing context after the second @@", () => {
    expect(parseHunkHeader("@@ -1,3 +1,4 @@ function foo() {")).toEqual({ oldStart: 1, newStart: 1 });
  });

  it("returns null for an unrecognized header", () => {
    expect(parseHunkHeader("not a hunk header")).toBeNull();
  });
});

describe("computeLineNumbers", () => {
  it("advances both counters for context lines", () => {
    const result = computeLineNumbers("@@ -10,3 +10,3 @@", [
      { kind: "context" },
      { kind: "context" },
      { kind: "context" },
    ]);
    expect(result).toEqual([
      { oldLine: 10, newLine: 10 },
      { oldLine: 11, newLine: 11 },
      { oldLine: 12, newLine: 12 },
    ]);
  });

  it("only advances newLine for added lines", () => {
    const result = computeLineNumbers("@@ -5,1 +5,3 @@", [
      { kind: "context" },
      { kind: "add" },
      { kind: "add" },
    ]);
    expect(result).toEqual([
      { oldLine: 5, newLine: 5 },
      { oldLine: null, newLine: 6 },
      { oldLine: null, newLine: 7 },
    ]);
  });

  it("only advances oldLine for deleted lines", () => {
    const result = computeLineNumbers("@@ -5,3 +5,1 @@", [
      { kind: "context" },
      { kind: "del" },
      { kind: "del" },
    ]);
    expect(result).toEqual([
      { oldLine: 5, newLine: 5 },
      { oldLine: 6, newLine: null },
      { oldLine: 7, newLine: null },
    ]);
  });

  it("handles a realistic mixed hunk", () => {
    const result = computeLineNumbers("@@ -1,3 +1,3 @@", [
      { kind: "context" },
      { kind: "del" },
      { kind: "add" },
      { kind: "context" },
    ]);
    expect(result).toEqual([
      { oldLine: 1, newLine: 1 },
      { oldLine: 2, newLine: null },
      { oldLine: null, newLine: 2 },
      { oldLine: 3, newLine: 3 },
    ]);
  });

  it("falls back to starting at 1 for an unparseable header", () => {
    const result = computeLineNumbers("garbage", [{ kind: "context" }]);
    expect(result).toEqual([{ oldLine: 1, newLine: 1 }]);
  });
});
