import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import type { CommitNode } from "./types";

export interface UniverseLink {
  source: string;
  target: string;
}

export interface UniverseLayout {
  positions: Map<string, { x: number; y: number }>;
  links: UniverseLink[];
}

interface SimNode {
  id: string;
  x?: number;
  y?: number;
}

const TICKS = 300;

/// Runs a force simulation to convergence synchronously (rather than
/// animating it tick-by-tick on a timer) and hands back final positions —
/// the "explosion" is a one-time layout step, not an ongoing physics view, so
/// there's nothing to gain from spreading it across frames. Charge repulsion
/// is what gives the "exploded" spread; the link force pulls parent/child
/// pairs back together just enough to keep lineage legible as clusters
/// rather than a uniform cloud.
export function computeUniverseLayout(commits: CommitNode[]): UniverseLayout {
  const hashSet = new Set(commits.map((c) => c.hash));
  const nodes: SimNode[] = commits.map((c) => ({ id: c.hash }));
  const links: UniverseLink[] = [];
  for (const c of commits) {
    for (const parent of c.parents) {
      if (hashSet.has(parent)) links.push({ source: c.hash, target: parent });
    }
  }

  // forceLink mutates its input links' source/target from ids into node
  // object references — feed it a throwaway copy so the returned `links`
  // stays plain {source, target} hash strings for callers/rendering.
  const simLinks = links.map((l) => ({ ...l }));

  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(30)
        .strength(0.5),
    )
    .force("charge", forceManyBody().strength(-45))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(12))
    .stop();

  for (let i = 0; i < TICKS; i++) simulation.tick();

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });

  return { positions, links };
}
