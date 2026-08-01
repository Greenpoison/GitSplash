import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { GitBranchPlus, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import * as api from "@/lib/api";
import type { ReflogEntry, Repo } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { useUndoStore } from "@/store/undoStore";

/// HEAD's reflog is one of git's best safety nets — every commit HEAD has
/// pointed to on this machine survives here for a while (git only expires
/// unreachable entries after ~90 days by default), even ones from a deleted
/// branch, a hard reset, or a rebase. Almost no beginner knows this exists,
/// so "I think I lost my work" usually reads as a dead end when it isn't.
export function ReflogPanel({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [entries, setEntries] = useState<ReflogEntry[] | null>(null);
  const [branchTarget, setBranchTarget] = useState<ReflogEntry | null>(null);
  const [branchName, setBranchName] = useState("");
  const [resetTarget, setResetTarget] = useState<ReflogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  const load = () => {
    api
      .getReflog(repo.id, 150)
      .then(setEntries)
      .catch((e) => reportGitError(e));
  };

  useEffect(() => {
    setEntries(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const createBranchHere = async () => {
    const name = branchName.trim();
    if (!name || !branchTarget) return;
    setBusy(true);
    try {
      await api.createBranch(repo.id, name, branchTarget.hash);
      toast.success(`Created and switched to ${name}`);
      setBranchTarget(null);
      setBranchName("");
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const resetHere = async () => {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const previousHeadSha = await api.getHeadSha(repo.id);
      await api.resetTo(repo.id, resetTarget.hash, "hard");
      toast.success(`Reset to ${resetTarget.hash.slice(0, 7)}`);
      if (previousHeadSha) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: "Reset from reflog",
          destructive: true,
          undoCommand: `git reset --hard ${previousHeadSha.slice(0, 7)}`,
          redoCommand: `git reset --hard ${resetTarget.hash.slice(0, 7)}`,
          undo: () => api.resetTo(repo.id, previousHeadSha, "hard").then(onChanged),
          redo: () => api.resetTo(repo.id, resetTarget.hash, "hard").then(onChanged),
        });
      }
      setResetTarget(null);
      load();
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <History className="size-3.5" /> What is this?
        </div>
        Every commit HEAD has ever pointed to on this machine stays listed here for a while —
        even ones from a branch you deleted, a hard reset, or a rebase. If you think you lost
        work, it's very likely still below.
      </div>

      <ScrollArea className="gradient-border h-[60vh] rounded-md bg-card">
        {entries === null ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No reflog entries found.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {entries.map((e, i) => (
              <div key={`${e.selector}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {e.selector}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.action}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.hash.slice(0, 7)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(e.date)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-xs"
                  onClick={() => {
                    setBranchTarget(e);
                    setBranchName("");
                  }}
                >
                  <GitBranchPlus className="size-3" /> Create branch here
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-xs text-destructive"
                  onClick={() => setResetTarget(e)}
                >
                  <RotateCcw className="size-3" /> Reset here
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!branchTarget} onOpenChange={(o) => !o && setBranchTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a branch at {branchTarget?.hash.slice(0, 7)}</DialogTitle>
            <DialogDescription>
              The safest way to recover this — nothing about your current branch changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reflog-branch-name">Branch name</Label>
            <Input
              id="reflog-branch-name"
              autoFocus
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBranchHere()}
              placeholder="recovered-work"
            />
          </div>
          <DialogFooter>
            <Button onClick={createBranchHere} disabled={busy || !branchName.trim()}>
              Create &amp; checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to {resetTarget?.hash.slice(0, 7)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Moves your current branch to point here, discarding anything only reachable from
              where it is now. That commit stays in the reflog too, so this itself can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetTarget && <GitCommandPreview command={`git reset --hard ${resetTarget.hash.slice(0, 7)}`} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetHere}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
