import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { reportGitError } from "@/lib/gitErrors";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileWarning,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as api from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import type { CommitNode, FileChange, FileDiff, Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import { GitCommandTooltip } from "@/components/GitCommandTooltip";
import { ConflictResolverDialog } from "./ConflictResolverDialog";
import { GitignoreAssistant } from "./GitignoreAssistant";
import { StashPanel } from "./StashPanel";
import { lintCommitMessage } from "@/lib/commitMessageLint";
import { DiffHunkView } from "./DiffHunkView";

const STATUS_LABEL: Record<string, string> = {
  M: "M",
  A: "A",
  D: "D",
  R: "R",
  C: "C",
  T: "T",
  U: "U",
};

function FileRow({
  repoId,
  change,
  staged,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  repoId: string;
  change: FileChange;
  staged: boolean;
  selected: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const code = staged ? change.indexStatus : change.isUntracked ? "?" : change.worktreeStatus;
  const [lastCommit, setLastCommit] = useState<CommitNode | null | undefined>(undefined);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <Badge
        variant="outline"
        className={cn(
          "w-5 shrink-0 justify-center px-0 text-[10px]",
          change.isConflicted && "border-destructive text-destructive",
        )}
      >
        {STATUS_LABEL[code] ?? code}
      </Badge>
      <Tooltip
        onOpenChange={(open) => {
          if (open && lastCommit === undefined) {
            api
              .getFileHistory(repoId, change.path, 1)
              .then((commits) => setLastCommit(commits[0] ?? null))
              .catch(() => setLastCommit(null));
          }
        }}
      >
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate font-mono">{change.path}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {lastCommit === undefined ? (
            "Loading…"
          ) : lastCommit === null ? (
            "No history yet — this file has never been committed."
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{lastCommit.subject}</span>
              <span className="opacity-80">
                {lastCommit.author} · {relativeTime(lastCommit.date)}
              </span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
      <span className="flex shrink-0 gap-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
        {staged ? (
          <GitCommandTooltip label="Unstage" command={`git restore --staged -- ${change.path}`}>
            <Button
              size="icon"
              variant="ghost"
              className="size-5"
              aria-label="Unstage"
              onClick={(e) => { e.stopPropagation(); onUnstage?.(); }}
            >
              <ArrowLeft className="size-3" />
            </Button>
          </GitCommandTooltip>
        ) : (
          <>
            <GitCommandTooltip
              label="Discard"
              command={change.isUntracked ? `rm ${change.path}` : `git restore -- ${change.path}`}
            >
              <Button
                size="icon"
                variant="ghost"
                className="size-5"
                aria-label="Discard"
                onClick={(e) => { e.stopPropagation(); onDiscard?.(); }}
              >
                <Trash2 className="size-3" />
              </Button>
            </GitCommandTooltip>
            <GitCommandTooltip label="Stage" command={`git add -- ${change.path}`}>
              <Button
                size="icon"
                variant="ghost"
                className="size-5"
                aria-label="Stage"
                onClick={(e) => { e.stopPropagation(); onStage?.(); }}
              >
                <ArrowRight className="size-3" />
              </Button>
            </GitCommandTooltip>
          </>
        )}
      </span>
    </button>
  );
}

/// Wraps a FileRow so it can be dragged into the other zone (staged <->
/// unstaged) as a quicker alternative to the per-row stage/unstage buttons —
/// both stay available since drag targets can be fiddly with a trackpad.
function DraggableFileRow({ path, staged, children }: { path: string; staged: boolean; children: ReactNode }) {
  // A partially-staged file (some hunks staged, some not) appears in both
  // the staged and unstaged lists with the same path — the zone prefix
  // keeps the two draggable ids from colliding in that case.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${staged ? "staged" : "unstaged"}:${path}`,
    data: { staged, path },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}

function DroppableZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex flex-col gap-1 rounded-md", isOver && "bg-accent/40")}>
      {children}
    </div>
  );
}

export function ChangesPanel({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [committing, setCommitting] = useState(false);
  const [amend, setAmend] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<FileChange | null>(null);
  const [discardHunkRaw, setDiscardHunkRaw] = useState<string | null>(null);
  const [wrapDiff, setWrapDiff] = useState(false);
  const [resolvingPath, setResolvingPath] = useState<string | null>(null);
  const pushUndo = useUndoStore((s) => s.push);

  const staged = useMemo(
    () => files.filter((f) => f.indexStatus !== "." && !f.isUntracked && !f.isConflicted),
    [files],
  );
  const unstaged = useMemo(
    () => files.filter((f) => f.worktreeStatus !== "." || f.isUntracked).filter((f) => !f.isConflicted),
    [files],
  );
  const conflicted = useMemo(() => files.filter((f) => f.isConflicted), [files]);
  const messageTips = useMemo(() => lintCommitMessage(summary), [summary]);
  const fullMessage = useMemo(
    () => (description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()),
    [summary, description],
  );

  const loadFiles = async () => {
    try {
      const changes = await api.getFileChanges(repo.id);
      setFiles(changes);
      if (selected && !changes.some((c) => c.path === selected.path)) {
        setSelected(null);
        setDiff(null);
      }
    } catch (e) {
      reportGitError(e);
    }
  };

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  useEffect(() => {
    if (!selected) return;
    const change = files.find((f) => f.path === selected.path);
    if (!change) return;
    api
      .getFileDiff(repo.id, selected.path, selected.staged, change.isUntracked && !selected.staged)
      .then(setDiff)
      .catch((e) => reportGitError(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, repo.id]);

  const refreshAfterAction = async () => {
    await loadFiles();
    onChanged();
    if (selected) {
      const change = files.find((f) => f.path === selected.path);
      api
        .getFileDiff(repo.id, selected.path, selected.staged, !!change?.isUntracked && !selected.staged)
        .then(setDiff)
        .catch(() => setDiff(null));
    }
  };

  const stage = async (path: string) => {
    try {
      await api.stageFile(repo.id, path);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Stage ${path}`,
        undo: () => api.unstageFile(repo.id, path).then(refreshAfterAction),
        redo: () => api.stageFile(repo.id, path).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };
  const unstage = async (path: string) => {
    try {
      await api.unstageFile(repo.id, path);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Unstage ${path}`,
        undo: () => api.stageFile(repo.id, path).then(refreshAfterAction),
        redo: () => api.unstageFile(repo.id, path).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as { staged?: boolean; path?: string } | undefined;
    if (!data?.path) return;
    if (over.id === "staged-zone" && !data.staged) stage(data.path);
    else if (over.id === "unstaged-zone" && data.staged) unstage(data.path);
  };

  const discard = async () => {
    if (!discardTarget) return;
    try {
      // Deliberately not added to the undo stack — discarding uncommitted
      // changes is genuinely unrecoverable, so there's nothing to undo to.
      // The confirm dialog below is the safety net for this one instead.
      await api.discardFile(repo.id, discardTarget.path, discardTarget.isUntracked);
      setDiscardTarget(null);
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };
  const stageAll = async () => {
    const paths = unstaged.map((f) => f.path);
    try {
      await api.stageAll(repo.id);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Stage all (${paths.length} files)`,
        undo: () => Promise.all(paths.map((p) => api.unstageFile(repo.id, p))).then(refreshAfterAction),
        redo: () => api.stageAll(repo.id).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };
  const unstageAll = async () => {
    const paths = staged.map((f) => f.path);
    try {
      await api.unstageAll(repo.id);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Unstage all (${paths.length} files)`,
        undo: () => Promise.all(paths.map((p) => api.stageFile(repo.id, p))).then(refreshAfterAction),
        redo: () => api.unstageAll(repo.id).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };

  const stageHunk = async (raw: string) => {
    if (!selected) return;
    const path = selected.path;
    try {
      await api.stageHunk(repo.id, path, raw);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Stage hunk in ${path}`,
        undo: () => api.unstageHunk(repo.id, path, raw).then(refreshAfterAction),
        redo: () => api.stageHunk(repo.id, path, raw).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };
  const unstageHunk = async (raw: string) => {
    if (!selected) return;
    const path = selected.path;
    try {
      await api.unstageHunk(repo.id, path, raw);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Unstage hunk in ${path}`,
        undo: () => api.stageHunk(repo.id, path, raw).then(refreshAfterAction),
        redo: () => api.unstageHunk(repo.id, path, raw).then(refreshAfterAction),
      });
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };
  const discardHunk = async () => {
    if (!selected || !discardHunkRaw) return;
    try {
      // Not undoable — see discard() above.
      await api.discardHunk(repo.id, selected.path, discardHunkRaw);
      setDiscardHunkRaw(null);
      await refreshAfterAction();
    } catch (e) {
      reportGitError(e);
    }
  };

  const commit = async () => {
    if (!summary.trim()) {
      toast.error("Write a commit summary first");
      return;
    }
    if (!amend && staged.length === 0) {
      toast.error("Nothing staged to commit");
      return;
    }
    if (conflicted.length > 0) {
      toast.error("Resolve the remaining conflicts before committing");
      return;
    }
    setCommitting(true);
    try {
      const previousHeadSha = amend
        ? await api.amendCommit(repo.id, fullMessage)
        : await api.commitChanges(repo.id, fullMessage);
      setSummary("");
      setDescription("");
      setAmend(false);
      setSelected(null);
      setDiff(null);
      await refreshAfterAction();
      toast.success(amend ? "Amended" : "Committed");
      if (previousHeadSha) {
        const newHeadSha = await api.getHeadSha(repo.id);
        if (newHeadSha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: amend ? "Amend commit" : "Commit",
            // Soft reset: safe — it only moves HEAD, never touches the
            // working tree or index, so nothing uncommitted is at risk.
            undo: () => api.resetTo(repo.id, previousHeadSha, "soft").then(refreshAfterAction),
            redo: () => api.resetTo(repo.id, newHeadSha, "soft").then(refreshAfterAction),
          });
        }
      }
    } catch (e) {
      reportGitError(e);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <GitignoreAssistant repo={repo} changedFiles={files} onChanged={refreshAfterAction} />
      <StashPanel repo={repo} hasChanges={files.length > 0} onChanged={refreshAfterAction} />
      <div className="flex h-[480px] gap-4">
      <div className="flex w-64 shrink-0 flex-col gap-3">
        <ScrollArea className="gradient-border flex-1 rounded-md bg-card p-2">
          <DndContext sensors={dndSensors} onDragEnd={onDragEnd}>
            {conflicted.length > 0 && (
              <div className="mb-2 flex flex-col gap-1">
                <div className="flex items-center gap-1 px-1 text-xs font-semibold text-destructive">
                  <AlertTriangle className="size-3.5" /> Conflicted
                </div>
                {conflicted.map((f) => (
                  <FileRow
                    key={f.path}
                    repoId={repo.id}
                    change={f}
                    staged={false}
                    selected={false}
                    onSelect={() => setResolvingPath(f.path)}
                  />
                ))}
              </div>
            )}

            <div className="mb-2 flex flex-col gap-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Staged ({staged.length})
                </span>
                {staged.length > 0 && (
                  <button onClick={unstageAll} className="text-xs text-muted-foreground underline">
                    Unstage all
                  </button>
                )}
              </div>
              <DroppableZone id="staged-zone">
                {staged.map((f) => (
                  <DraggableFileRow key={f.path} path={f.path} staged>
                    <FileRow
                      repoId={repo.id}
                      change={f}
                      staged
                      selected={selected?.path === f.path && selected.staged}
                      onSelect={() => setSelected({ path: f.path, staged: true })}
                      onUnstage={() => unstage(f.path)}
                    />
                  </DraggableFileRow>
                ))}
              </DroppableZone>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Changes ({unstaged.length})
                </span>
                {unstaged.length > 0 && (
                  <button onClick={stageAll} className="text-xs text-muted-foreground underline">
                    Stage all
                  </button>
                )}
              </div>
              <DroppableZone id="unstaged-zone">
                {unstaged.map((f) => (
                  <DraggableFileRow key={f.path} path={f.path} staged={false}>
                    <FileRow
                      repoId={repo.id}
                      change={f}
                      staged={false}
                      selected={selected?.path === f.path && !selected.staged}
                      onSelect={() => setSelected({ path: f.path, staged: false })}
                      onStage={() => stage(f.path)}
                      onDiscard={() => setDiscardTarget(f)}
                    />
                  </DraggableFileRow>
                ))}
                {files.length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">Working tree clean.</p>
                )}
              </DroppableZone>
            </div>
          </DndContext>
        </ScrollArea>

        <div className="flex flex-col gap-2">
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summary (required)"
            className="text-sm font-medium"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="text-sm"
          />
          {messageTips.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {messageTips.map((tip, i) => (
                <li key={i} className="flex gap-1">
                  <span className="shrink-0">·</span>
                  {tip.text}
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={amend}
              onCheckedChange={async (c) => {
                setAmend(!!c);
                if (c && !summary.trim()) {
                  const last = await api.getCommit(repo.id, "HEAD").catch(() => null);
                  if (last) {
                    setSummary(last.subject);
                    setDescription(last.body);
                  }
                }
              }}
            />
            Amend previous commit
          </label>
          {amend && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              This replaces your last commit. If it's already been pushed, you'll need to
              force-push afterward to update the remote.
            </p>
          )}
          <Button
            onClick={commit}
            disabled={committing || (!amend && staged.length === 0) || conflicted.length > 0 || !summary.trim()}
          >
            {committing
              ? amend
                ? "Amending…"
                : "Committing…"
              : conflicted.length > 0
                ? "Resolve conflicts first"
                : !amend && staged.length === 0
                  ? "Stage files to commit"
                  : !summary.trim()
                    ? "Write a commit summary"
                    : amend
                      ? "Amend previous commit"
                      : `Commit ${staged.length} file${staged.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="gradient-border h-full rounded-md bg-card p-2">
          {!selected && (
            <p className="p-2 text-sm text-muted-foreground">Select a file to see its diff.</p>
          )}
          {selected && !diff && <p className="p-2 text-sm text-muted-foreground">Loading diff…</p>}
          {selected && diff?.isBinary && (
            <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <FileWarning className="size-4" /> Binary file — no text diff available.
            </div>
          )}
          {selected && diff && !diff.isBinary && diff.hunks.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No visible differences for this file. Git still lists it as changed — this usually
              means only line endings or file mode changed, or the index just needs a refresh.
              Re-open the repo or run <code className="font-mono">git status</code> again in a
              moment; it often clears on its own.
            </p>
          )}
          {selected && diff && !diff.isBinary && diff.hunks.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
                <Checkbox checked={wrapDiff} onCheckedChange={(c) => setWrapDiff(!!c)} className="size-3.5" />
                Wrap long lines
              </label>
              {diff.hunks.map((hunk, i) => (
                <DiffHunkView
                  key={i}
                  hunk={hunk}
                  staged={selected.staged}
                  patchable={hunk.raw.length > 0}
                  wrap={wrapDiff}
                  onStage={() => stageHunk(hunk.raw)}
                  onUnstage={() => unstageHunk(hunk.raw)}
                  onDiscard={() => setDiscardHunkRaw(hunk.raw)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <AlertDialog open={!!discardTarget} onOpenChange={(o) => !o && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes to {discardTarget?.path}?</AlertDialogTitle>
            <AlertDialogDescription>
              {discardTarget?.isUntracked
                ? "This deletes the file — it isn't tracked by git, so there's no history to recover it from."
                : "This permanently discards the unstaged changes to this file."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discardTarget && (
            <GitCommandPreview
              command={
                discardTarget.isUntracked
                  ? `rm ${discardTarget.path}`
                  : `git restore -- ${discardTarget.path}`
              }
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!discardHunkRaw} onOpenChange={(o) => !o && setDiscardHunkRaw(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this hunk?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently discards these lines from {selected?.path} — it can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <GitCommandPreview command="git apply --reverse (just this hunk)" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discardHunk}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {resolvingPath && (
        <ConflictResolverDialog
          repoId={repo.id}
          path={resolvingPath}
          open={!!resolvingPath}
          onOpenChange={(o) => !o && setResolvingPath(null)}
          onResolved={refreshAfterAction}
        />
      )}
      </div>
    </div>
  );
}
