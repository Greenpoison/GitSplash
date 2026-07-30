import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BranchInfo, CherryPickStepResult, Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";
import { ConflictResolverDialog } from "./ConflictResolverDialog";

interface PickRow {
  sha: string;
  subject: string;
  author: string;
  selected: boolean;
}

type Phase = "select" | "busy" | "plan" | "conflict";

function SortableRow({
  row,
  index,
  onToggle,
}: {
  row: PickRow;
  index: number;
  onToggle: (selected: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.sha,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center gap-2 rounded-md border bg-card p-2", !row.selected && "opacity-60")}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox checked={row.selected} onCheckedChange={(c) => onToggle(!!c)} />
      <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
      <span className="flex-1 truncate text-xs">{row.subject}</span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{row.author}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.sha.slice(0, 7)}</span>
    </div>
  );
}

export function CherryPickDialog({
  repo,
  open,
  onOpenChange,
  onChanged,
}: {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("select");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<PickRow[]>([]);
  const [busyLabel, setBusyLabel] = useState("");
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);
  const [resolvingPath, setResolvingPath] = useState<string | null>(null);
  const pushUndo = useUndoStore((s) => s.push);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!open) return;
    setPhase("select");
    setRows([]);
    setSource("");
    setConflictedFiles([]);
    setProgress(null);

    (async () => {
      try {
        const [inProgress, branchList] = await Promise.all([
          api.getInProgressCherryPick(repo.id),
          api.listBranches(repo.id),
        ]);
        setBranches(branchList.filter((b) => !b.isCurrent));
        if (inProgress) {
          setProgress({ step: inProgress.currentStep, total: inProgress.totalSteps });
          setConflictedFiles(inProgress.conflictedFiles);
          setPhase("conflict");
        }
      } catch (e) {
        toast.error(String(e));
      }
    })();
  }, [open, repo.id]);

  const loadCommits = async () => {
    if (!source) return;
    setBusyLabel("Loading commits…");
    setPhase("busy");
    try {
      const commits = await api.getCherryPickCandidates(repo.id, source);
      if (commits.length === 0) {
        toast.info(`No commits on ${source} that aren't already on the current branch`);
        setPhase("select");
        return;
      }
      setRows(
        commits.map((c) => ({
          sha: c.hash,
          subject: c.subject,
          author: c.author,
          selected: false,
        })),
      );
      setPhase("plan");
    } catch (e) {
      toast.error(String(e));
      setPhase("select");
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.sha === active.id);
      const newIndex = prev.findIndex((r) => r.sha === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleResult = (result: CherryPickStepResult) => {
    if (result.status === "done") {
      toast.success("Cherry-pick complete");
      if (result.previousHeadSha && result.newHeadSha) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Cherry-pick from ${source || "another branch"}`,
          destructive: true,
          undo: () => api.resetTo(repo.id, result.previousHeadSha!, "hard").then(onChanged),
          redo: () => api.resetTo(repo.id, result.newHeadSha!, "hard").then(onChanged),
        });
      }
      onChanged();
      onOpenChange(false);
      return;
    }
    setConflictedFiles(result.conflictedFiles);
    setProgress({ step: result.step, total: result.totalSteps });
    setPhase("conflict");
    toast.warning(result.message ?? "Cherry-pick stopped with conflicts");
  };

  const refreshInProgress = async () => {
    const inProgress = await api.getInProgressCherryPick(repo.id).catch(() => null);
    if (inProgress) {
      setProgress({ step: inProgress.currentStep, total: inProgress.totalSteps });
      setConflictedFiles(inProgress.conflictedFiles);
      setPhase("conflict");
    } else {
      setPhase("plan");
    }
  };

  const start = async () => {
    const shas = rows.filter((r) => r.selected).map((r) => r.sha);
    if (shas.length === 0) {
      toast.error("Select at least one commit to cherry-pick");
      return;
    }
    setBusyLabel("Cherry-picking…");
    setPhase("busy");
    try {
      const result = await api.startCherryPick(repo.id, shas);
      handleResult(result);
    } catch (e) {
      toast.error(String(e));
      await refreshInProgress();
    }
  };

  const continueCherryPick = async () => {
    setBusyLabel("Continuing…");
    setPhase("busy");
    try {
      const result = await api.continueCherryPick(repo.id);
      handleResult(result);
    } catch (e) {
      toast.error(String(e));
      setPhase("conflict");
    }
  };

  const abort = async () => {
    setBusyLabel("Aborting…");
    setPhase("busy");
    try {
      await api.abortCherryPick(repo.id);
      toast.info("Cherry-pick aborted");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
      setPhase("conflict");
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => phase !== "busy" && onOpenChange(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cherry-pick commits</DialogTitle>
          </DialogHeader>

          {phase === "select" && (
            <div className="flex flex-col gap-3 p-1">
              <p className="text-sm text-muted-foreground">
                Choose a branch to pick commits from onto the current branch.
              </p>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Pick from…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={loadCommits} disabled={!source}>
                  Load commits
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "busy" && <p className="p-4 text-sm text-muted-foreground">{busyLabel}</p>}

          {phase === "plan" && (
            <>
              <ScrollArea className="gradient-border max-h-[420px] rounded-md bg-card p-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={rows.map((r) => r.sha)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1.5">
                      {rows.map((row, i) => (
                        <SortableRow
                          key={row.sha}
                          row={row}
                          index={i}
                          onToggle={(selected) =>
                            setRows((prev) => prev.map((r) => (r.sha === row.sha ? { ...r, selected } : r)))
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
              <DialogFooter>
                <span className="mr-auto text-xs text-muted-foreground">
                  {selectedCount} of {rows.length} selected — applied top to bottom
                </span>
                <Button variant="outline" onClick={() => setPhase("select")}>
                  Back
                </Button>
                <Button onClick={start} disabled={selectedCount === 0}>
                  Cherry-pick {selectedCount || ""}
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === "conflict" && (
            <div className="flex flex-col gap-3 p-1">
              {progress && (
                <p className="text-sm text-muted-foreground">
                  Stopped at step {progress.step + 1} of {progress.total}.
                </p>
              )}
              {conflictedFiles.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="size-3.5" /> Conflicted files
                  </div>
                  {conflictedFiles.map((f) => (
                    <button
                      key={f}
                      onClick={() => setResolvingPath(f)}
                      className="rounded-md border px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  All conflicts resolved — continue the cherry-pick.
                </p>
              )}
              <DialogFooter>
                <Button variant="destructive" onClick={abort}>
                  Abort cherry-pick
                </Button>
                <Button onClick={continueCherryPick} disabled={conflictedFiles.length > 0}>
                  Continue cherry-pick
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {resolvingPath && (
        <ConflictResolverDialog
          repoId={repo.id}
          path={resolvingPath}
          open={!!resolvingPath}
          onOpenChange={(o) => !o && setResolvingPath(null)}
          onResolved={() => {
            setConflictedFiles((prev) => prev.filter((f) => f !== resolvingPath));
          }}
        />
      )}
    </>
  );
}
