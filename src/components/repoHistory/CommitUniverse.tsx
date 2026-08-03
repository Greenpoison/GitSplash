import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Locate, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiffStatBadge } from "@/components/repos/DiffStatBadge";
import { ancestorsOfBranchTip, colorForBranchName, computeBranchSegments } from "@/lib/branchSegments";
import { computeUniverseLayout } from "@/lib/commitUniverseLayout";
import { reportGitError } from "@/lib/gitErrors";
import { relativeTime } from "@/lib/utils";
import * as api from "@/lib/api";
import type { BranchInfo, CommitNode, CompareFile, TagInfo } from "@/lib/types";

const UNATTRIBUTED_COLOR = "#d8d8f0";
const VERSION_RING_COLOR = "#ffd76a";
const SELECTION_RING_COLOR = "#4fd1ff";
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const FILE_HISTORY_LIMIT = 2000;

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

/// The "exploded universe": a force-spread starfield of every commit across
/// all local branches, rather than the single-lane linear list CommitGraph
/// shows for one branch's history. Clicking a commit shows what it changed;
/// clicking one of those files then tracks it — highlighting every commit
/// across every branch that touched it — which is a far more concrete
/// through-line to follow than an abstract "everything connected to this
/// commit" trace was.
export function CommitUniverse({
  repoId,
  commits,
  branches,
  tags,
}: {
  repoId: string;
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

  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<CompareFile[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesFailed, setFilesFailed] = useState(false);

  const [trackedFile, setTrackedFile] = useState<string | null>(null);
  const [trackedHashes, setTrackedHashes] = useState<Set<string> | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const dragRef = useRef<
    { pointerId: number; startX: number; startY: number; panX: number; panY: number; captured: boolean } | null
  >(null);

  // Bumped on every selectCommit/trackFile call (and on anything that
  // abandons one without starting a replacement) so an in-flight fetch's
  // callback can tell it's no longer the latest request and skip applying
  // its result — without this, clicking a different commit or file before
  // the previous fetch resolves could let a stale, out-of-order response
  // overwrite what's actually selected.
  const selectionRequestRef = useRef(0);
  const trackingRequestRef = useRef(0);

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
  // active selection/tracking obviously no longer applies once the graph
  // underneath it has changed.
  useEffect(() => {
    selectionRequestRef.current += 1;
    trackingRequestRef.current += 1;
    setView(DEFAULT_VIEW);
    setSelectedHash(null);
    setCommitFiles(null);
    setTrackedFile(null);
    setTrackedHashes(null);
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

  // Every non-current local branch, regardless of whether it has any commits
  // colorFor would actually attribute to it — a branch that's already fully
  // merged (or was only ever a marker on plain mainline history, e.g. a
  // release-tracking branch) has nothing unique to permanently color, but
  // hovering it to see its full lineage is still meaningful, so it still
  // belongs in the legend.
  const legendBranches = branchNames;

  const hoveredBranchAncestors = useMemo(
    () => (hoveredBranch ? ancestorsOfBranchTip(commits, hoveredBranch) : null),
    [hoveredBranch, commits],
  );

  const selectCommit = (hash: string) => {
    if (selectedHash === hash) {
      // Clicking the same commit again closes the panel.
      selectionRequestRef.current += 1;
      trackingRequestRef.current += 1;
      setSelectedHash(null);
      setCommitFiles(null);
      setTrackedFile(null);
      setTrackedHashes(null);
      return;
    }
    trackingRequestRef.current += 1; // abandon any in-flight tracking fetch from the previous commit
    const requestId = ++selectionRequestRef.current;
    setSelectedHash(hash);
    setTrackedFile(null);
    setTrackedHashes(null);
    setCommitFiles(null);
    setFilesFailed(false);
    setFilesLoading(true);
    api
      .getCommitFiles(repoId, hash)
      .then((files) => {
        if (selectionRequestRef.current !== requestId) return;
        setCommitFiles(files);
      })
      .catch((e) => {
        if (selectionRequestRef.current !== requestId) return;
        reportGitError(e);
        setFilesFailed(true);
      })
      .finally(() => {
        if (selectionRequestRef.current !== requestId) return;
        setFilesLoading(false);
      });
  };

  const trackFile = (path: string) => {
    const requestId = ++trackingRequestRef.current;
    setTrackedFile(path);
    setTrackedHashes(null);
    setTrackingLoading(true);
    api
      .getFileHistoryAcrossBranches(repoId, path, FILE_HISTORY_LIMIT)
      .then((history) => {
        if (trackingRequestRef.current !== requestId) return;
        setTrackedHashes(new Set(history.map((c) => c.hash)));
      })
      .catch((e) => {
        if (trackingRequestRef.current !== requestId) return;
        reportGitError(e);
        setTrackedFile(null);
      })
      .finally(() => {
        if (trackingRequestRef.current !== requestId) return;
        setTrackingLoading(false);
      });
  };

  const clearAll = () => {
    selectionRequestRef.current += 1;
    trackingRequestRef.current += 1;
    setSelectedHash(null);
    setCommitFiles(null);
    setTrackedFile(null);
    setTrackedHashes(null);
  };

  const backToFiles = () => {
    trackingRequestRef.current += 1; // abandon any in-flight tracking fetch
    setTrackedFile(null);
    setTrackedHashes(null);
  };

  const colorFor = (hash: string) => {
    const label = segments.get(hash);
    return label ? colorForBranchName(label) : UNATTRIBUTED_COLOR;
  };

  const isDimmed = (hash: string): boolean => {
    if (trackedHashes) return !trackedHashes.has(hash);
    if (hoveredBranchAncestors) return !hoveredBranchAncestors.has(hash);
    return false;
  };

  // Deliberately does NOT capture the pointer here. A click on a commit
  // node fires pointerdown on the node first, which bubbles up to this
  // handler — capturing immediately (before knowing this is a click, not a
  // drag) redirects the browser's eventual pointerup/mouseup to the SVG
  // instead of the node, which silently breaks the node's click handler
  // for every plain click. Capture only kicks in once real movement proves
  // this is actually a pan — see onPointerMoveCanvas — by which point any
  // click's mouseup has already long resolved normally.
  const DRAG_THRESHOLD_PX = 4;

  const onPointerDownCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: view.panX,
      panY: view.panY,
      captured: false,
    };
  };

  const onPointerMoveCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.captured) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.captured = true;
      // Captured only now — once movement is confirmed — so panning still
      // keeps working even if the pointer moves outside the SVG mid-drag.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView((prev) => ({ ...prev, panX: drag.panX + dx, panY: drag.panY + dy }));
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
  const selectedCommit = selectedHash ? (commitByHash.get(selectedHash) ?? null) : null;

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
            const isSelected = selectedHash === c.hash;
            return (
              <g key={c.hash} opacity={dim ? 0.15 : 1}>
                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius + 5}
                    fill="none"
                    stroke={SELECTION_RING_COLOR}
                    strokeWidth={1.5}
                  />
                )}
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
                  onClick={() => selectCommit(c.hash)}
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

      {selectedCommit && (
        <div className="absolute bottom-3 left-3 flex max-h-64 w-80 flex-col rounded-md border border-white/10 bg-black/70 p-3 text-xs text-white/80 backdrop-blur-sm">
          {trackedFile ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono font-medium text-white" title={trackedFile}>
                  {trackedFile}
                </span>
                <button className="shrink-0 text-white/50 hover:text-white" onClick={clearAll}>
                  Clear
                </button>
              </div>
              <div className="mt-1">
                {trackingLoading
                  ? "Loading…"
                  : `${trackedHashes?.size ?? 0} commit${trackedHashes?.size === 1 ? "" : "s"} touched this file, across every branch.`}
              </div>
              <button
                className="mt-2 flex items-center gap-1 self-start text-white/60 hover:text-white"
                onClick={backToFiles}
              >
                <ArrowLeft className="size-3" /> Back to changed files
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-white" title={selectedCommit.subject}>
                  {selectedCommit.subject}
                </span>
                <button className="shrink-0 text-white/50 hover:text-white" onClick={clearAll}>
                  Clear
                </button>
              </div>
              <div className="mt-1 text-white/60">Files changed — click one to track it across the graph:</div>
              <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {filesLoading && <div className="text-white/50">Loading…</div>}
                {filesFailed && <div className="text-red-300">Couldn't load changed files.</div>}
                {!filesLoading && !filesFailed && commitFiles?.length === 0 && (
                  <div className="text-white/50">No file changes (e.g. a merge commit).</div>
                )}
                {commitFiles?.map((f) => (
                  <button
                    key={f.path}
                    className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-left font-mono hover:bg-white/10"
                    onClick={() => trackFile(f.path)}
                  >
                    <span className="min-w-0 flex-1 truncate">{f.path}</span>
                    <DiffStatBadge file={f} />
                  </button>
                ))}
              </div>
            </>
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
    // to the graph's own pan/zoom/selection state.
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
