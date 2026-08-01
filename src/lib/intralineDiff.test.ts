import { describe, expect, it } from "vitest";
import { computeIntralineHighlights } from "./intralineDiff";

describe("computeIntralineHighlights", () => {
  it("returns null for every line when there's no del/add pairing", () => {
    const lines = [
      { kind: "context", content: "unchanged" },
      { kind: "add", content: "brand new line" },
    ];
    const result = computeIntralineHighlights(lines);
    expect(result).toEqual([null, null]);
  });

  it("highlights only the changed word in a 1:1 replaced line", () => {
    const lines = [
      { kind: "del", content: "const foo = 1;" },
      { kind: "add", content: "const foo = 2;" },
    ];
    const [delSegs, addSegs] = computeIntralineHighlights(lines);
    expect(delSegs).not.toBeNull();
    expect(addSegs).not.toBeNull();
    // The unchanged prefix should not be marked changed...
    expect(delSegs!.some((s) => !s.changed && s.text.includes("const foo ="))).toBe(true);
    // ...but the differing digit should be.
    expect(delSegs!.some((s) => s.changed && s.text.includes("1"))).toBe(true);
    expect(addSegs!.some((s) => s.changed && s.text.includes("2"))).toBe(true);
  });

  it("pairs multiple del/add lines in order within one block", () => {
    const lines = [
      { kind: "del", content: "line a v1" },
      { kind: "del", content: "line b v1" },
      { kind: "add", content: "line a v2" },
      { kind: "add", content: "line b v2" },
    ];
    const result = computeIntralineHighlights(lines);
    expect(result.every((r) => r !== null)).toBe(true);
    // First del pairs with first add, not the second.
    expect(result[0]!.some((s) => s.changed && s.text.includes("v1"))).toBe(true);
    expect(result[2]!.some((s) => s.changed && s.text.includes("v2"))).toBe(true);
  });

  it("falls back to null when del/add counts in a block don't match", () => {
    const lines = [
      { kind: "del", content: "one" },
      { kind: "del", content: "two" },
      { kind: "add", content: "only one replacement" },
    ];
    const result = computeIntralineHighlights(lines);
    expect(result).toEqual([null, null, null]);
  });

  it("leaves context lines untouched even between changed blocks", () => {
    const lines = [
      { kind: "del", content: "old" },
      { kind: "add", content: "new" },
      { kind: "context", content: "unchanged" },
    ];
    const result = computeIntralineHighlights(lines);
    expect(result[0]).not.toBeNull();
    expect(result[1]).not.toBeNull();
    expect(result[2]).toBeNull();
  });
});
