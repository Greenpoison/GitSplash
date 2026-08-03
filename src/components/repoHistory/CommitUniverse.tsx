import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorForBranchName, computeBranchSegments } from "@/lib/branchSegments";
import { traceLineage } from "@/lib/commitLineage";
import { computeUniverseLayout } from "@/lib/commitUniverseLayout";
import { relativeTime } from "@/lib/utils";
import type { BranchInfo, CommitNode, TagInfo } from "@/lib/types";

const UNATTRIBUTED_COLOR = "#d8d8f0";
const VERSION_RING_COLOR = "#ffd76a";
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

/// The "exploded universe": a force-spread starfield of every commit across
/// all local branches, rather than the single-lane linear list CommitGraph
/// shows for one branch's history. Clicking a commit traces its full
/// lineage — ancestors and descendants — and dims everything not part of
/// that line of work, so you can see one feature's path through the shape
/// of the whole project.
export function CommitUniverse({
  commits,
  branches,
  tags,
}: {
  commits: CommitNode[];
  branches: BranchInfo[];
  tags: TagInfo[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const sizeRef = useRef(size);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [tracedHash, setTracedHash] = useState<string | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A different repo's commits loading in should never leave the camera
  // parked over an empty corner of the previous repo's layout, and any
  // active trace obviously no longer applies once the graph underneath it
  // has changed.
  useEffect(() => {
    setView(DEFAULT_VIEW);
    setTracedHash(null);
  }, [commits]);

  const zoomAt = useCallback((mx: number, my: number, factor: number) => {
    setView((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
      const ratio = nextZoom / prev.zoom;
      const cx = sizeRef.current.width / 2;
      const cy = sizeRef.current.height / 2;
      return {
        zoom: nextZoom,
        panX: mx - cx - ratio * (mx - cx - prev.panX),
        panY: my - cy - ratio * (my - cy - prev.panY),
      };
    });
  }, []);

  // React's synthetic wheel handler is passive by default, so
  // preventDefault() inside it can't actually stop the page from scrolling
  // while zooming — a native listener with { passive: false } is the only
  // reliable way to do that.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomAt]);

  const resetView = () => setView(DEFAULT_VIEW);

  const { positions, links } = useMemo(() => computeUniverseLayout(commits), [commits]);

  // Excludes the currently checked-out branch the same way CommitGraph does
  // — its own tip is wherever HEAD is, not a fixed ref to color a stretch
  // of history up to.
  const branchNames = useMemo(
    () => branches.filter((b) => !b.isCurrent && !b.isRemote).map((b) => b.name),
    [branches],
  );
  const segments = useMemo(() => computeBranchSegments(commits, branchNames), [commits, branchNames]);
  const tagByHash = useMemo(() => new Map(tags.map((t) => [t.hash, t])), [tags]);
  const commitByHash = useMemo(() => new Map(commits.map((c) => [c.hash, c])), [commits]);

  const legendBranches = useMemo(() => {
    const used = new Set(segments.values());
    return branchNames.filter((n) => used.has(n));
  }, [segments, branchNames]);

  const tracedSet = useMemo(() => (tracedHash ? traceLineage(commits, tracedHash) : null), [commits, tracedHash]);
  const tracedCommit = tracedHash ? (commitByHash.get(tracedHash) ?? null) : null;
  const tracedVersions = useMemo(() => {
    if (!tracedSet) return [];
    // `commits` is newest-first; reverse so versions read oldest-to-newest,
    // matching the order the feature actually shipped in.
    return commits
      .filter((c) => tracedSet.has(c.hash) && tagByHash.has(c.hash))
      .map((c) => tagByHash.get(c.hash)!.name)
      .reverse();
  }, [tracedSet, commits, tagByHash]);

  const colorFor = (hash: string) => {
    const label = segments.get(hash);
    return label ? colorForBranchName(label) : UNATTRIBUTED_COLOR;
  };

  const isDimmed = (hash: string): boolean => {
    if (tracedSet) return !tracedSet.has(hash);
    if (hoveredBranch) return segments.get(hash) !== hoveredBranch;
    return false;
  };

  const onPointerDownCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
  };

  const onPointerMoveCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setView((prev) => ({
      ...prev,
      panX: drag.panX + (e.clientX - drag.startX),
      panY: drag.panY + (e.clientY - drag.startY),
    }));
  };

  const onPointerUpCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  if (commits.length === 0) {
    return (
      <div className="flex min-h-[500px] flex-1 items-center justify-center rounded-lg border text-sm text-muted-foreground">
        No commits found.
      </div>
    );
  }

  const cx = size.width / 2 + view.panX;
  const cy = size.height / 2 + view.panY;
  const hoveredCommit = hoveredHash ? (commitByHash.get(hoveredHash) ?? null) : null;
  const hoveredPos = hoveredHash ? (positions.get(hoveredHash) ?? null) : null;

  return (
    <div
      ref={containerRef}
      className="relative min-h-[500px] flex-1 overflow-hidden rounded-lg border"
      style={{ background: "radial-gradient(ellipse at center, #1a1140 0%, #05050f 65%)" }}
    >
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        onPointerDown={onPointerDownCanvas}
        onPointerMove={onPointerMoveCanvas}
        onPointerUp={onPointerUpCanvas}
        onPointerCancel={onPointerUpCanvas}
        onDoubleClick={resetView}
        className="cursor-grab touch-none active:cursor-grabbing"
      >
        <defs>
          <filter id="commit-universe-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <Starfield width={size.width} height={size.height} />
        <g transform={`translate(${cx}, ${cy}) scale(${view.zoom})`}>
          {links.map((link, i) => {
            const from = positions.get(link.source);
            const to = positions.get(link.target);
            if (!from || !to) return null;
            const dim = isDimmed(link.source) || isDimmed(link.target);
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={colorFor(link.source)}
                strokeWidth={dim ? 0.5 : 1}
                opacity={dim ? 0.08 : 0.55}
              />
            );
          })}
          {commits.map((c) => {
            const pos = positions.get(c.hash);
            if (!pos) return null;
            const tag = tagByHash.get(c.hash);
            const isMerge = c.parents.length > 1;
            const radius = tag ? 6 : isMerge ? 5 : 3.5;
            const dim = isDimmed(c.hash);
            const isHovered = hoveredHash === c.hash;
            return (
              <g key={c.hash} opacity={dim ? 0.15 : 1}>
                {tag && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius + 3}
                    fill="none"
                    stroke={VERSION_RING_COLOR}
                    strokeWidth={1}
                    opacity={0.8}
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isHovered ? radius + 2 : radius}
                  fill={colorFor(c.hash)}
                  filter="url(#commit-universe-glow)"
                />
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius + 6}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredHash(c.hash)}
                  onMouseLeave={() => setHoveredHash((h) => (h === c.hash ? null : h))}
                  onClick={() => setTracedHash((prev) => (prev === c.hash ? null : c.hash))}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {legendBranches.length > 0 && (
        <div className="absolute left-3 top-3 flex max-w-56 flex-col gap-1 rounded-md border border-white/10 bg-black/40 p-2 text-xs text-white/80 backdrop-blur-sm">
          {legendBranches.map((name) => (
            <button
              key={name}
              onMouseEnter={() => setHoveredBranch(name)}
              onMouseLeave={() => setHoveredBranch((b) => (b === name ? null : b))}
              className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-left hover:bg-white/10"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorForBranchName(name) }} />
              <span className="truncate font-mono">{name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="absolute right-3 top-3 flex items-center gap-1">
        <Button size="icon-sm" variant="secondary" onClick={() => zoomAt(size.width / 2, size.height / 2, 1.3)} title="Zoom in">
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={() => zoomAt(size.width / 2, size.height / 2, 1 / 1.3)}
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="secondary" onClick={resetView} title="Reset view">
          <Locate className="size-3.5" />
        </Button>
      </div>

      {hoveredCommit && hoveredPos && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-white/10 bg-black/80 p-2 text-xs text-white shadow-lg"
          style={{ left: cx + hoveredPos.x * view.zoom + 10, top: cy + hoveredPos.y * view.zoom + 10 }}
        >
          <div className="font-medium">{hoveredCommit.subject}</div>
          <div className="mt-1 flex items-center gap-2 text-white/60">
            <span>{hoveredCommit.author}</span>
            <span>{relativeTime(hoveredCommit.date)}</span>
            <span className="font-mono">{hoveredCommit.hash.slice(0, 7)}</span>
          </div>
          {tagByHash.get(hoveredCommit.hash) && (
            <div className="mt-1 text-amber-300">{tagByHash.get(hoveredCommit.hash)!.name}</div>
          )}
        </div>
      )}

      {tracedCommit && (
        <div className="absolute bottom-3 left-3 max-w-sm rounded-md border border-white/10 bg-black/60 p-3 text-xs text-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white">Tracing "{tracedCommit.subject}"</span>
            <button className="text-white/50 hover:text-white" onClick={() => setTracedHash(null)}>
              Clear
            </button>
          </div>
          <div className="mt-1">{tracedSet?.size ?? 0} commits in this line of history.</div>
          {tracedVersions.length > 0 && (
            <div className="mt-1">
              Shipped in: <span className="text-amber-300">{tracedVersions.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Starfield({ width, height }: { width: number; height: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 160 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.1 + 0.2,
        o: Math.random() * 0.6 + 0.15,
      })),
    // A fixed backdrop that only needs to resize with the canvas, not react
    // to the graph's own pan/zoom/trace state.
    [width, height],
  );
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
      ))}
    </g>
  );
}
