import type { CommitNode } from "./types";

/// Every commit reachable from `hash` by walking parents (its ancestry) or by
/// walking the reverse direction (its descendants) — together, "this
/// commit's line of work" from its own origin through to whatever later
/// history built on top of it, across however many branches/merges that
/// spans. `hash` itself is included.
export function traceLineage(commits: CommitNode[], hash: string): Set<string> {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const childrenOf = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parents) {
      const list = childrenOf.get(p);
      if (list) list.push(c.hash);
      else childrenOf.set(p, [c.hash]);
    }
  }

  const visited = new Set<string>();
  if (!byHash.has(hash)) return visited;
  visited.add(hash);

  const queue = [hash];
  while (queue.length > 0) {
    const h = queue.shift()!;
    for (const parent of byHash.get(h)?.parents ?? []) {
      if (byHash.has(parent) && !visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  queue.push(hash);
  while (queue.length > 0) {
    const h = queue.shift()!;
    for (const child of childrenOf.get(h) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  return visited;
}
