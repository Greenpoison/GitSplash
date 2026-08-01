import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeLineNumbers } from "@/lib/diffLineNumbers";
import { computeIntralineHighlights } from "@/lib/intralineDiff";
import type { DiffHunk } from "@/lib/types";

const LINE_STYLES: Record<string, string> = {
  add: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  del: "bg-red-500/10 text-red-700 dark:text-red-400",
  context: "text-muted-foreground",
};

const CHANGED_SEGMENT_STYLES: Record<string, string> = {
  add: "bg-emerald-500/30",
  del: "bg-red-500/30",
};

export function DiffHunkView({
  hunk,
  staged,
  patchable,
  wrap,
  onStage,
  onUnstage,
  onDiscard,
}: {
  hunk: DiffHunk;
  staged: boolean;
  patchable: boolean;
  wrap?: boolean;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const lineNumbers = useMemo(() => computeLineNumbers(hunk.header, hunk.lines), [hunk]);
  const intraline = useMemo(() => computeIntralineHighlights(hunk.lines), [hunk]);

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between bg-muted/50 px-2 py-1">
        <span className="font-mono text-xs text-muted-foreground">{hunk.header}</span>
        {patchable && (
          <div className="flex gap-1">
            {staged ? (
              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={onUnstage}>
                <ArrowLeft className="size-3" /> Unstage hunk
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={onDiscard}>
                  <Trash2 className="size-3" /> Discard hunk
                </Button>
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={onStage}>
                  <ArrowRight className="size-3" /> Stage hunk
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="font-mono text-xs">
        {hunk.lines.map((line, i) => {
          const { oldLine, newLine } = lineNumbers[i];
          const segments = intraline[i];
          return (
            <div
              key={i}
              className={cn(
                "flex px-2",
                wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre",
                LINE_STYLES[line.kind],
              )}
            >
              <span className="mr-2 w-8 shrink-0 select-none text-right text-muted-foreground/60">
                {oldLine ?? ""}
              </span>
              <span className="mr-2 w-8 shrink-0 select-none text-right text-muted-foreground/60">
                {newLine ?? ""}
              </span>
              <span className="select-none opacity-60">
                {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
              </span>
              {segments ? (
                segments.map((seg, si) => (
                  <span
                    key={si}
                    className={seg.changed ? CHANGED_SEGMENT_STYLES[line.kind] : undefined}
                  >
                    {seg.text}
                  </span>
                ))
              ) : (
                line.content
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
