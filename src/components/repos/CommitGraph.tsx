import { useMemo, useState } from "react";
import type { CommitNode } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const ROW_HEIGHT = 30;
const WRAPPED_ROW_HEIGHT = 54;
const COL_WIDTH = 16;
const MARGIN = 10;
const LANE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface LaidOutNode {
  node: CommitNode;
  row: number;
  col: number;
}

interface Edge {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

function layout(nodes: CommitNode[]): { laid: LaidOutNode[]; edges: Edge[]; columns: number } {
  const hashToRow = new Map(nodes.map((n, i) => [n.hash, i]));
  const pendingColumns = new Map<string, number>();
  const freeColumns: number[] = [];
  let nextColumn = 0;
  const col: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const hash = nodes[i].hash;
    let column: number;
    if (pendingColumns.has(hash)) {
      column = pendingColumns.get(hash)!;
      pendingColumns.delete(hash);
    } else {
      column = freeColumns.length > 0 ? freeColumns.pop()! : nextColumn++;
    }
    col[i] = column;

    const parents = nodes[i].parents.filter((p) => hashToRow.has(p));
    if (parents.length === 0) {
      freeColumns.push(column);
    } else {
      const [first, ...rest] = parents;
      if (!pendingColumns.has(first)) {
        pendingColumns.set(first, column);
      } else {
        freeColumns.push(column);
      }
      for (const p of rest) {
        if (!pendingColumns.has(p)) {
          const newCol = freeColumns.length > 0 ? freeColumns.pop()! : nextColumn++;
          pendingColumns.set(p, newCol);
        }
      }
    }
  }

  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (const parent of nodes[i].parents) {
      const parentRow = hashToRow.get(parent);
      if (parentRow === undefined) continue;
      edges.push({ fromRow: i, fromCol: col[i], toRow: parentRow, toCol: col[parentRow] });
    }
  }

  return {
    laid: nodes.map((node, i) => ({ node, row: i, col: col[i] })),
    edges,
    columns: nextColumn,
  };
}

function x(col: number) {
  return MARGIN + col * COL_WIDTH;
}

export function CommitGraph({
  commits,
  onSelectCommit,
}: {
  commits: CommitNode[];
  onSelectCommit?: (node: CommitNode) => void;
}) {
  const [wrapText, setWrapText] = useState(false);
  // The SVG graph lines/dots are positioned off a fixed per-row height, so
  // wrapping can't make rows grow to arbitrary content height without
  // desyncing the graph from its text — instead it switches to a taller
  // fixed height (enough for ~2 lines) and clamps the subject to that.
  const rowHeight = wrapText ? WRAPPED_ROW_HEIGHT : ROW_HEIGHT;
  // No vertical margin here — the text rows next to this SVG start flush at
  // y=0 with no top offset of their own, so adding one here would (and did)
  // push every dot below the row center it's meant to line up with.
  const y = (row: number) => row * rowHeight + rowHeight / 2;

  const { laid, edges, columns } = useMemo(() => layout(commits), [commits]);
  const width = MARGIN * 2 + Math.max(columns, 1) * COL_WIDTH;
  const height = commits.length * rowHeight;

  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commits found.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Newest commits at the top, oldest at the bottom.</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Checkbox
            id="commit-graph-wrap"
            checked={wrapText}
            onCheckedChange={(c) => setWrapText(!!c)}
            className="size-3.5"
          />
          <Label htmlFor="commit-graph-wrap" className="text-xs font-normal text-muted-foreground">
            Wrap text
          </Label>
        </div>
      </div>
      <div className="gradient-border flex max-h-[420px] overflow-auto rounded-md bg-card">
        <svg width={width} height={height} className="shrink-0">
          {edges.map((e, i) => {
            const color = LANE_COLORS[e.fromCol % LANE_COLORS.length];
            const x1 = x(e.fromCol);
            const y1 = y(e.fromRow);
            const x2 = x(e.toCol);
            const y2 = y(e.toRow);
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                stroke={color}
                strokeWidth={2}
                fill="none"
                opacity={0.8}
              />
            );
          })}
          {laid.map(({ node, row, col }) => (
            <circle
              key={node.hash}
              cx={x(col)}
              cy={y(row)}
              r={4}
              fill={LANE_COLORS[col % LANE_COLORS.length]}
            />
          ))}
        </svg>
        <div className="flex-1 divide-y">
          {laid.map(({ node }) => (
            <div
              key={node.hash}
              style={{ height: rowHeight }}
              role={onSelectCommit ? "button" : undefined}
              tabIndex={onSelectCommit ? 0 : undefined}
              onClick={() => onSelectCommit?.(node)}
              className={cn(
                "flex items-center gap-2 px-2 text-sm text-foreground dark:text-foreground/75",
                onSelectCommit && "cursor-pointer hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 font-medium",
                  wrapText ? "line-clamp-2 break-words whitespace-normal" : "truncate",
                )}
              >
                {node.subject}
              </span>
              {node.refs
                .filter((r) => !r.startsWith("HEAD"))
                .map((ref) => (
                  <span
                    key={ref}
                    className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {ref}
                  </span>
                ))}
              <span className="ml-auto shrink-0 whitespace-nowrap text-muted-foreground">
                {node.author}
              </span>
              <span
                className="shrink-0 whitespace-nowrap text-muted-foreground"
                title={new Date(node.date).toLocaleString()}
              >
                {relativeTime(node.date)}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">
                {node.hash.slice(0, 7)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
