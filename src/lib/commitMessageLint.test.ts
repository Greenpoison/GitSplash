import { describe, expect, it } from "vitest";
import { lintCommitMessage } from "./commitMessageLint";

describe("lintCommitMessage", () => {
  it("returns no tips for an empty message", () => {
    expect(lintCommitMessage("   ")).toEqual([]);
  });

  it("flags a vague subject", () => {
    const tips = lintCommitMessage("wip");
    expect(tips.some((t) => t.text.includes("doesn't say what changed"))).toBe(true);
  });

  it("flags a subject over 72 characters", () => {
    const tips = lintCommitMessage("a".repeat(80));
    expect(tips.some((t) => t.text.includes("characters"))).toBe(true);
  });

  it("flags trailing punctuation", () => {
    const tips = lintCommitMessage("Add the thing.");
    expect(tips.some((t) => t.text.includes("no period"))).toBe(true);
  });

  it("suggests the imperative form of a past-tense first word", () => {
    const tips = lintCommitMessage("Fixed the bug in the parser");
    expect(tips.some((t) => t.text.includes('"fix" instead of "fixed"'))).toBe(true);
  });

  it("flags a missing blank line before the body", () => {
    const tips = lintCommitMessage("Add feature\nsome detail right below it");
    expect(tips.some((t) => t.text.includes("blank line"))).toBe(true);
  });

  it("has no tips for a well-formed message", () => {
    const tips = lintCommitMessage("Add feature\n\nSome detail below a blank line.");
    expect(tips).toEqual([]);
  });
});
