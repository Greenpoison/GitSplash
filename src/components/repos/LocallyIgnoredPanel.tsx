import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommandTooltip } from "@/components/GitCommandTooltip";
import * as api from "@/lib/api";
import type { Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";

/// Manages files marked "keep locally, never commit" (git's skip-worktree
/// bit) from the Changes tab or GitignoreAssistant — the only place to see
/// which files are currently set this way and reverse it, since git itself
/// has no first-class UI for a flag it otherwise expects you to remember
/// via `git ls-files -v`.
export function LocallyIgnoredPanel({ repo }: { repo: Repo }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  const load = async () => {
    try {
      setFiles(await api.listSkipWorktreeFiles(repo.id));
    } catch (e) {
      reportGitError(e);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const restore = async (path: string) => {
    setBusy(true);
    try {
      await api.unskipWorktree(repo.id, [path]);
      toast.success(`${path} is tracked normally again`);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Restore tracking for ${path}`,
        undoCommand: `git update-index --skip-worktree -- ${path}`,
        redoCommand: `git update-index --no-skip-worktree -- ${path}`,
        undo: () => api.skipWorktree(repo.id, [path]).then(load),
        redo: () => api.unskipWorktree(repo.id, [path]).then(load),
      });
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await api.unskipWorktree(repo.id, files);
      toast.success(`${files.length} file${files.length === 1 ? "" : "s"} back to normal tracking`);
      pushUndo({
        id: crypto.randomUUID(),
        repoId: repo.id,
        label: `Restore tracking for ${files.length} file${files.length === 1 ? "" : "s"}`,
        undoCommand: `git update-index --skip-worktree -- ${files.join(" ")}`,
        redoCommand: `git update-index --no-skip-worktree -- ${files.join(" ")}`,
        undo: () => api.skipWorktree(repo.id, files).then(load),
        redo: () => api.unskipWorktree(repo.id, files).then(load),
      });
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  if (files === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Files marked to keep local changes to forever, without committing them — git stops
          reporting them as modified. Nothing here ever gets committed or affects .gitignore.
        </p>
        {files.length > 1 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={restoreAll} className="shrink-0">
            <RotateCcw className="size-3.5" /> Restore all
          </Button>
        )}
      </div>

      {files.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nothing here yet. In the Changes tab, click the <Lock className="inline size-3" /> icon
          next to a change to keep it local without committing it.
        </p>
      ) : (
        <ScrollArea className="h-[400px] rounded-md border">
          <div className="flex flex-col divide-y">
            {files.map((path) => (
              <div key={path} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
                <GitCommandTooltip
                  label="Restore normal tracking"
                  command={`git update-index --no-skip-worktree -- ${path}`}
                >
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => restore(path)}>
                    <RotateCcw className="size-3.5" /> Restore tracking
                  </Button>
                </GitCommandTooltip>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
