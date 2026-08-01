import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { GitMerge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import * as api from "@/lib/api";
import type { BranchInfo, Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";

/// Pulled out of BranchesPanel's own toolbar (which was getting crowded) —
/// same merge logic and --no-ff explanation as before, just behind a single
/// "Merge…" button instead of a permanently-visible picker + checkbox.
export function MergeBranchDialog({
  repo,
  branches,
  current,
  open,
  onOpenChange,
  onChanged,
}: {
  repo: Repo;
  branches: BranchInfo[];
  current?: BranchInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [mergeTarget, setMergeTarget] = useState("");
  const [noFf, setNoFf] = useState(true);
  const [busy, setBusy] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  useEffect(() => {
    if (!open) setMergeTarget("");
  }, [open]);

  const merge = async () => {
    if (!mergeTarget) return;
    setBusy(true);
    try {
      const result = await api.mergeBranch(repo.id, mergeTarget, noFf);
      if (result.success) {
        toast.success(`Merged ${mergeTarget}`);
        if (result.previousHeadSha && result.newHeadSha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: `Merge ${mergeTarget}`,
            destructive: true,
            undoCommand: `git reset --hard ${result.previousHeadSha.slice(0, 7)}`,
            redoCommand: `git reset --hard ${result.newHeadSha.slice(0, 7)}`,
            undo: () => api.resetTo(repo.id, result.previousHeadSha!, "hard").then(onChanged),
            redo: () => api.resetTo(repo.id, result.newHeadSha!, "hard").then(onChanged),
          });
        }
        onOpenChange(false);
      } else {
        toast.warning(result.message ?? "Merge stopped with conflicts", {
          description: result.conflictedFiles.join(", "),
        });
      }
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into {current?.name ?? "current"}</DialogTitle>
          <DialogDescription>Brings another branch's commits into the branch you're on now.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Branch to merge…" />
            </SelectTrigger>
            <SelectContent>
              {branches
                .filter((b) => !b.isCurrent)
                .map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={noFf} onCheckedChange={(c) => setNoFf(!!c)} className="size-3.5" />
            Always create a merge commit
          </label>
          <p className="text-[11px] text-muted-foreground">
            When off, git fast-forwards silently if it can — no merge commit, and the branch's
            history folds flat into a single line with nothing left to show it ever branched.
            Leave this on to keep that history visible in the graph.
          </p>
          <GitCommandPreview
            command={`git merge${noFf ? " --no-ff" : ""} --no-edit ${mergeTarget || "<branch>"}`}
          />
        </div>
        <DialogFooter>
          <Button onClick={merge} disabled={!mergeTarget || busy}>
            <GitMerge className="size-4" /> {busy ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
