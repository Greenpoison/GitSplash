import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BranchInfo, RebaseAction, RebasePlanItem, RebaseStepResult, Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";
import { ConflictResolverDialog } from "./ConflictResolverDialog";

interface PlanRow {
  sha: string;
  subject: string;
  author: string;
  action: RebaseAction;
  message: string;
}

const ACTIONS: { value: RebaseAction; label: string }[] = [
  { value: "pick", label: "Pick" },
  { value: "reword", label: "Reword" },
  { value: "squash", label: "Squash" },
  { value: "fixup", label: "Fixup" },
  { value: "drop", label: "Drop" },
];

type Phase = "select" | "busy" | "plan" | "conflict";

function SortableRow({
  row,
  index,
  canCombine,
  onActionChange,
  onMessageChange,
}: {
  row: PlanRow;
  index: number;
  canCombine: boolean;
  onActionChange: (action: RebaseAction) => void;
  onMessageChange: (message: string) => void;
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
    <div ref={setNodeRef} style={style} className="flex flex-col gap-1.5 rounded-md border bg-card p-2">
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
        <Select value={row.action} onValueChange={(v) => onActionChange(v as RebaseAction)}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem
                key={a.value}
                value={a.value}
                disabled={!canCombine && (a.value === "squash" || a.value === "fixup")}
              >
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={cn(
            "flex-1 truncate text-xs",
            row.action === "drop" && "text-muted-foreground line-through",
          )}
        >
          {row.subject}
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{row.author}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.sha.slice(0, 7)}</span>
      </div>
      {row.action === "reword" && (
        <Textarea
          value={row.message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="New commit message"
          rows={2}
          className="text-xs"
        />
      )}
    </div>
  );
}

export function RebaseDialog({
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
  const [onto, setOnto] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [busyLabel, setBusyLabel] = useState("");
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);
  const [resolvingPath, setResolvingPath] = useState<string | null>(null);
  const [originalBranch, setOriginalBranch] = useState("");
  const pushUndo = useUndoStore((s) => s.push);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!open) return;
    setPhase("select");
    setRows([]);
    setOnto("");
    setConflictedFiles([]);
    setProgress(null);

    (async () => {
      try {
        const [inProgress, branchList] = await Promise.all([
          api.getInProgressRebase(repo.id),
          api.listBranches(repo.id),
        ]);
        setBranches(branchList.filter((b) => !b.isCurrent));
        if (inProgress) {
          setOriginalBranch(inProgress.originalBranch);
          setProgress({ step: inProgress.currentStep, total: inProgress.totalSteps });
          setConflictedFiles(inProgress.conflictedFiles);
          setPhase("conflict");
        } else {
          const current = branchList.find((b) => b.isCurrent);
          if (current) setOriginalBranch(current.name);
        }
      } catch (e) {
        reportGitError(e);
      }
    })();
  }, [open, repo.id]);

  const loadCommits = async () => {
    if (!onto) return;
    setBusyLabel("Loading commits…");
    setPhase("busy");
    try {
      const commits = await api.getRebaseCandidates(repo.id, onto);
      if (commits.length === 0) {
        toast.info(`Already up to date with ${onto} — nothing to rebase`);
        setPhase("select");
        return;
      }
      setRows(
        commits.map((c) => ({
          sha: c.hash,
          subject: c.subject,
          author: c.author,
          action: "pick" as RebaseAction,
          message: c.subject,
        })),
      );
      setPhase("plan");
    } catch (e) {
      reportGitError(e);
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

  const updateRow = (sha: string, patch: Partial<PlanRow>) => {
    setRows((prev) => prev.map((r) => (r.sha === sha ? { ...r, ...patch } : r)));
  };

  const handleResult = (result: RebaseStepResult) => {
    if (result.status === "done") {
      toast.success(`Rebased onto ${onto || "target"}`);
      if (result.previousHeadSha && result.newHeadSha) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Rebase ${originalBranch || repo.displayName}`,
          destructive: true,
          undoCommand: `git reset --hard ${result.previousHeadSha!.slice(0, 7)}`,
          redoCommand: `git reset --hard ${result.newHeadSha!.slice(0, 7)}`,
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
    toast.warning(result.message ?? "Rebase stopped with conflicts");
  };

  const refreshInProgress = async () => {
    const inProgress = await api.getInProgressRebase(repo.id).catch(() => null);
    if (inProgress) {
      setOriginalBranch(inProgress.originalBranch);
      setProgress({ step: inProgress.currentStep, total: inProgress.totalSteps });
      setConflictedFiles(inProgress.conflictedFiles);
      setPhase("conflict");
    } else {
      setPhase("plan");
    }
  };

  const start = async () => {
    if (rows.some((r) => r.action === "reword" && !r.message.trim())) {
      toast.error("Reworded commits need a message");
      return;
    }
    setBusyLabel("Rebasing…");
    setPhase("busy");
    try {
      const plan: RebasePlanItem[] = rows.map((r) => ({
        sha: r.sha,
        action: r.action,
        message: r.action === "reword" ? r.message.trim() : null,
      }));
      const result = await api.startRebase(repo.id, onto, plan);
      handleResult(result);
    } catch (e) {
      reportGitError(e);
      await refreshInProgress();
    }
  };

  const continueRebase = async () => {
    setBusyLabel("Continuing…");
    setPhase("busy");
    try {
      const result = await api.continueRebase(repo.id);
      handleResult(result);
    } catch (e) {
      reportGitError(e);
      setPhase("conflict");
    }
  };

  const abort = async () => {
    setBusyLabel("Aborting…");
    setPhase("busy");
    try {
      await api.abortRebase(repo.id);
      toast.info("Rebase aborted");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      reportGitError(e);
      setPhase("conflict");
    }
  };

  let seenKept = false;
  const canCombineFlags = rows.map((r) => {
    const ok = seenKept;
    if (r.action !== "drop") seenKept = true;
    return ok;
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => phase !== "busy" && onOpenChange(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Interactive rebase</DialogTitle>
          </DialogHeader>

          {phase === "select" && (
            <div className="flex flex-col gap-3 p-1">
              <p className="text-sm text-muted-foreground">
                Choose a branch to rebase the current branch onto. You'll get a
                reorderable list of the commits unique to your branch.
              </p>
              <Select value={onto} onValueChange={setOnto}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Rebase onto…" />
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
                <Button onClick={loadCommits} disabled={!onto}>
                  Load commits
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "busy" && <p className="p-4 text-sm text-muted-foreground">{busyLabel}</p>}

          {phase === "plan" && (
            <>
              <p className="text-xs text-muted-foreground">
                Drag to reorder. Reordering commits that depend on each other is likely to cause
                conflicts partway through.
              </p>
              <ScrollArea className="gradient-border max-h-[420px] rounded-md bg-card p-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={rows.map((r) => r.sha)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1.5">
                      {rows.map((row, i) => (
                        <SortableRow
                          key={row.sha}
                          row={row}
                          index={i}
                          canCombine={canCombineFlags[i]}
                          onActionChange={(action) => updateRow(row.sha, { action })}
                          onMessageChange={(message) => updateRow(row.sha, { message })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
              <DialogFooter>
                <span className="mr-auto text-xs text-muted-foreground">
                  {rows.length} commit{rows.length === 1 ? "" : "s"} — oldest first, applied top to bottom
                </span>
                <Button variant="outline" onClick={() => setPhase("select")}>
                  Back
                </Button>
                <Button onClick={start}>Start rebase</Button>
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
                  All conflicts resolved — continue the rebase.
                </p>
              )}
              <DialogFooter>
                <Button variant="destructive" onClick={abort}>
                  Abort rebase
                </Button>
                <Button onClick={continueRebase} disabled={conflictedFiles.length > 0}>
                  Continue rebase
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
