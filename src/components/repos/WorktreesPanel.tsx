import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { BranchInfo, Repo, WorktreeInfo } from "@/lib/types";

export function WorktreesPanel({ repo }: { repo: Repo }) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [targetPath, setTargetPath] = useState("");
  const [existingBranch, setExistingBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WorktreeInfo | null>(null);

  const load = async () => {
    try {
      const [w, b] = await Promise.all([api.listWorktrees(repo.id), api.listBranches(repo.id)]);
      setWorktrees(w);
      setBranches(b);
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const checkedOutBranches = useMemo(
    () => new Set(worktrees.map((w) => w.branch).filter((b): b is string => !!b)),
    [worktrees],
  );
  const availableBranches = branches.filter((b) => !checkedOutBranches.has(b.name));

  const add = async () => {
    if (!targetPath.trim()) {
      toast.error("Enter a path for the new worktree");
      return;
    }
    const creating = newBranchName.trim().length > 0;
    if (!creating && !existingBranch) {
      toast.error("Pick a branch, or type a name to create a new one");
      return;
    }
    setBusy(true);
    try {
      await api.addWorktree(
        repo.id,
        targetPath.trim(),
        creating ? newBranchName.trim() : existingBranch,
        creating,
      );
      toast.success(`Added worktree at ${targetPath.trim()}`);
      setTargetPath("");
      setExistingBranch("");
      setNewBranchName("");
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (force: boolean) => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await api.removeWorktree(repo.id, removeTarget.path, force);
      toast.success(`Removed worktree at ${removeTarget.path}`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const prune = async () => {
    setBusy(true);
    try {
      await api.pruneWorktrees(repo.id);
      toast.success("Pruned stale worktrees");
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        A worktree is a second working directory checked out from this same repo, on its own
        branch — useful for working on two branches side by side without stashing or switching.
      </p>
      <div className="gradient-border flex flex-col gap-2 rounded-md bg-card p-3">
        {worktrees.length === 0 && (
          <p className="text-sm text-muted-foreground">No worktrees found.</p>
        )}
        {worktrees.map((w) => (
          <div key={w.path} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono">{w.path}</span>
            {w.branch ? (
              <Badge variant="outline">{w.branch}</Badge>
            ) : (
              <Badge variant="secondary">detached @ {w.headSha?.slice(0, 7) ?? "?"}</Badge>
            )}
            {w.isLocked && (
              <Badge
                variant="outline"
                className="gap-1 text-amber-600 dark:text-amber-400"
                title="Locked worktrees resist accidental removal — force-remove to override"
              >
                <Lock className="size-3" /> locked
              </Badge>
            )}
            {w.isPrunable && (
              <Badge
                variant="outline"
                className="text-muted-foreground"
                title="Its directory is missing from disk — safe to prune"
              >
                prunable
              </Badge>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              disabled={busy}
              onClick={() => setRemoveTarget(w)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="self-start" onClick={prune} disabled={busy}>
          Prune stale worktrees
        </Button>
      </div>

      <div className="gradient-border flex flex-col gap-3 rounded-md bg-card p-3">
        <Label className="text-xs font-semibold text-muted-foreground">Add worktree</Label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="worktree-path">Path</Label>
          <Input
            id="worktree-path"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="D:\code\some-repo-feature-x"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Existing branch</Label>
          <Select
            value={existingBranch}
            onValueChange={(v) => {
              setExistingBranch(v);
              setNewBranchName("");
            }}
            disabled={newBranchName.trim().length > 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a branch…" />
            </SelectTrigger>
            <SelectContent>
              {availableBranches.map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="worktree-new-branch">Or create a new branch</Label>
          <Input
            id="worktree-new-branch"
            value={newBranchName}
            onChange={(e) => {
              setNewBranchName(e.target.value);
              if (e.target.value.trim()) setExistingBranch("");
            }}
            placeholder="feature/new-worktree-branch"
          />
        </div>
        <Button onClick={add} disabled={busy} className="self-start">
          <FolderPlus className="size-3.5" /> Add worktree
        </Button>
      </div>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove worktree at {removeTarget?.path}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the worktree's directory from disk, including any uncommitted changes
              in it — that part can't be undone. The branch itself and its history in the main
              repo are unaffected.
              {removeTarget?.isLocked && " This worktree is locked — removing it needs to be forced."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove(!!removeTarget?.isLocked)}>
              {removeTarget?.isLocked ? "Force remove" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
