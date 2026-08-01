import { describe, expect, it } from "vitest";
import { searchGlossary, type GlossaryEntry } from "./glossary";

const ENTRIES: GlossaryEntry[] = [
  { term: "Branch", definition: "A separate line of commits." },
  { term: "Stash", definition: "Temporarily sets aside uncommitted changes." },
  { term: "Reflog", definition: "A local log of everywhere HEAD has pointed, useful for undo." },
];

describe("searchGlossary", () => {
  it("returns everything for an empty query", () => {
    expect(searchGlossary("", ENTRIES)).toEqual(ENTRIES);
    expect(searchGlossary("   ", ENTRIES)).toEqual(ENTRIES);
  });

  it("matches on the term name, case-insensitively", () => {
    const result = searchGlossary("STASH", ENTRIES);
    expect(result).toEqual([ENTRIES[1]]);
  });

  it("matches on the definition text, not just the term", () => {
    const result = searchGlossary("undo", ENTRIES);
    expect(result).toEqual([ENTRIES[2]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchGlossary("xyzzy", ENTRIES)).toEqual([]);
  });

  it("defaults to the real glossary data when no entries are passed", () => {
    const result = searchGlossary("rebase");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((e) => e.term.toLowerCase() === "rebase")).toBe(true);
  });
});
