import { describe, expect, it } from "vitest";
import { colorForAge } from "./blameHeatmap";

const NOW = new Date("2026-08-01T00:00:00Z").getTime();

describe("colorForAge", () => {
  it("returns the warmest color for a line changed today", () => {
    expect(colorForAge("2026-07-31T00:00:00Z", NOW)).toBe("#ef4444");
  });

  it("returns a mid-range color for a few months old", () => {
    expect(colorForAge("2026-05-01T00:00:00Z", NOW)).toBe("#facc15");
  });

  it("returns the coolest color for a line untouched over a year", () => {
    expect(colorForAge("2023-01-01T00:00:00Z", NOW)).toBe("#64748b");
  });

  it("falls back to the coolest color for an unparseable date", () => {
    expect(colorForAge("not a date", NOW)).toBe("#64748b");
  });

  it("is consistent right at a bucket boundary", () => {
    const sevenDaysAgo = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
    const eightDaysAgo = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(colorForAge(sevenDaysAgo, NOW)).toBe("#ef4444");
    expect(colorForAge(eightDaysAgo, NOW)).not.toBe("#ef4444");
  });
});
