import type { DiffLineKind } from "./types";

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const match = header.match(HUNK_HEADER_RE);
  if (!match) return null;
  return { oldStart: Number(match[1]), newStart: Number(match[2]) };
}

export interface HunkLineNumbers {
  oldLine: number | null;
  newLine: number | null;
}

/// A context line advances both the old and new file's line counter; an
/// added line only exists in the new file (advances newLine, no oldLine);
/// a deleted line only exists in the old file (advances oldLine, no
/// newLine) — the same accounting git itself uses to print `@@ -a,b +c,d @@`
/// headers, just walked one line at a time instead of only at the hunk
/// boundaries.
export function computeLineNumbers(
  header: string,
  lines: { kind: DiffLineKind | string }[],
): HunkLineNumbers[] {
  const start = parseHunkHeader(header);
  let oldLine = start?.oldStart ?? 1;
  let newLine = start?.newStart ?? 1;

  return lines.map((line) => {
    if (line.kind === "add") {
      const result: HunkLineNumbers = { oldLine: null, newLine };
      newLine++;
      return result;
    }
    if (line.kind === "del") {
      const result: HunkLineNumbers = { oldLine, newLine: null };
      oldLine++;
      return result;
    }
    const result: HunkLineNumbers = { oldLine, newLine };
    oldLine++;
    newLine++;
    return result;
  });
}
