import { diffWordsWithSpace } from "diff";
import type { DiffLineKind } from "./types";

export interface IntralineSegment {
  text: string;
  changed: boolean;
}

/// Git's own diff output groups a changed block as all its deleted lines
/// followed immediately by all its added lines. When a block has the same
/// number of each, pairing them up 1:1 and running a word-level diff on
/// each pair highlights only the actual changed words instead of the whole
/// line — same idea as GitHub/GitLab's inline diff view. Falls back to
/// `null` (render the whole line as changed, same as before this existed)
/// for context lines, unpaired blocks, or blocks with mismatched counts,
/// since there's no sensible 1:1 pairing to diff in that case.
export function computeIntralineHighlights(
  lines: { kind: DiffLineKind | string; content: string }[],
): (IntralineSegment[] | null)[] {
  const result: (IntralineSegment[] | null)[] = lines.map(() => null);
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind !== "del") {
      i++;
      continue;
    }
    const delStart = i;
    while (i < lines.length && lines[i].kind === "del") i++;
    const delEnd = i;
    const addStart = i;
    while (i < lines.length && lines[i].kind === "add") i++;
    const addEnd = i;

    const delCount = delEnd - delStart;
    const addCount = addEnd - addStart;
    if (delCount > 0 && delCount === addCount) {
      for (let k = 0; k < delCount; k++) {
        const delLine = lines[delStart + k];
        const addLine = lines[addStart + k];
        const parts = diffWordsWithSpace(delLine.content, addLine.content);
        const delSegments: IntralineSegment[] = [];
        const addSegments: IntralineSegment[] = [];
        for (const part of parts) {
          if (part.removed) delSegments.push({ text: part.value, changed: true });
          else if (part.added) addSegments.push({ text: part.value, changed: true });
          else {
            delSegments.push({ text: part.value, changed: false });
            addSegments.push({ text: part.value, changed: false });
          }
        }
        result[delStart + k] = delSegments;
        result[addStart + k] = addSegments;
      }
    }
  }

  return result;
}
