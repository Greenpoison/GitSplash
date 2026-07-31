import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileWarning,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { cn } from "@/lib/utils";
import type { FileChange, FileDiff, Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";
import { ConflictResolverDialog } from "./ConflictResolverDialog";
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
  change,
  staged,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  change: FileChange;
  staged: boolean;
  selected: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const code = staged ? change.indexStatus : change.isUntracked ? "?" : change.worktreeStatus;
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
      <span className="min-w-0 flex-1 truncate font-mono">{change.path}</span>
      <span className="flex shrink-0 gap-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
        {staged ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-5"
            title="Unstage"
            aria-label="Unstage"
            onClick={(e) => { e.stopPropagation(); onUnstage?.(); }}
          >
            <ArrowLeft className="size-3" />
          </Button>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-5"
              title="Discard"
              aria-label="Discard"
              onClick={(e) => { e.stopPropagation(); onDiscard?.(); }}
            >
              <Trash2 className="size-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-5"
              title="Stage"
              aria-label="Stage"
              onClick={(e) => { e.stopPropagation(); onStage?.(); }}
            >
              <ArrowRight className="size-3" />
            </Button>
          </>
        )}
      </span>
    </button>
  );
}

export function ChangesPanel({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<FileChange | null>(null);
  const [discardHunkRaw, setDiscardHunkRaw] = useState<string | null>(null);
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

  const loadFiles = async () => {
    try {
      const changes = await api.getFileChanges(repo.id);
      setFiles(changes);
      if (selected && !changes.some((c) => c.path === selected.path)) {
        setSelected(null);
        setDiff(null);
      }
    } catch (e) {
      toast.error(String(e));
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
      .catch((e) => toast.error(String(e)));
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
      toast.error(String(e));
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
      toast.error(String(e));
    }
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
      toast.error(String(e));
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
      toast.error(String(e));
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
      toast.error(String(e));
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
      toast.error(String(e));
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
      toast.error(String(e));
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
      toast.error(String(e));
    }
  };

  const commit = async () => {
    if (!message.trim()) {
      toast.error("Write a commit message first");
      return;
    }
    if (staged.length === 0) {
      toast.error("Nothing staged to commit");
      return;
    }
    if (conflicted.length > 0) {
      toast.error("Resolve the remaining conflicts before committing");
      return;
    }
    setCommitting(true);
    try {
      const previousHeadSha = await api.commitChanges(repo.id, message.trim());
      setMessage("");
      setSelected(null);
      setDiff(null);
      await refreshAfterAction();
      toast.success("Committed");
      if (previousHeadSha) {
        const newHeadSha = await api.getHeadSha(repo.id);
        if (newHeadSha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: "Commit",
            // Soft reset: safe — it only moves HEAD, never touches the
            // working tree or index, so nothing uncommitted is at risk.
            undo: () => api.resetTo(repo.id, previousHeadSha, "soft").then(refreshAfterAction),
            redo: () => api.resetTo(repo.id, newHeadSha, "soft").then(refreshAfterAction),
          });
        }
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex h-[480px] gap-4">
      <div className="flex w-64 shrink-0 flex-col gap-3">
        <ScrollArea className="gradient-border flex-1 rounded-md bg-card p-2">
          {conflicted.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              <div className="flex items-center gap-1 px-1 text-xs font-semibold text-destructive">
                <AlertTriangle className="size-3.5" /> Conflicted
              </div>
              {conflicted.map((f) => (
                <FileRow
                  key={f.path}
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
            {staged.map((f) => (
              <FileRow
                key={f.path}
                change={f}
                staged
                selected={selected?.path === f.path && selected.staged}
                onSelect={() => setSelected({ path: f.path, staged: true })}
                onUnstage={() => unstage(f.path)}
              />
            ))}
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
            {unstaged.map((f) => (
              <FileRow
                key={f.path}
                change={f}
                staged={false}
                selected={selected?.path === f.path && !selected.staged}
                onSelect={() => setSelected({ path: f.path, staged: false })}
                onStage={() => stage(f.path)}
                onDiscard={() => setDiscardTarget(f)}
              />
            ))}
            {files.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">Working tree clean.</p>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            rows={3}
            className="text-sm"
          />
          <Button
            onClick={commit}
            disabled={committing || staged.length === 0 || conflicted.length > 0 || !message.trim()}
          >
            {committing
              ? "Committing…"
              : conflicted.length > 0
                ? "Resolve conflicts first"
                : staged.length === 0
                  ? "Stage files to commit"
                  : !message.trim()
                    ? "Write a commit message"
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
          {selected && diff && !diff.isBinary && (
            <div className="flex flex-col gap-2">
              {diff.hunks.map((hunk, i) => (
                <DiffHunkView
                  key={i}
                  hunk={hunk}
                  staged={selected.staged}
                  patchable={hunk.raw.length > 0}
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
  );
}
