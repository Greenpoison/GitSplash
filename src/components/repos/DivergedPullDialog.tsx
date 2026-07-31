import { useState } from "react";
import { toast } from "sonner";
import { GitCompareArrows, GitMerge } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { useUndoStore } from "@/store/undoStore";
import type { Repo } from "@/lib/types";
import { CompareBranchDialog } from "./CompareBranchDialog";

/// Shown when a pull can't fast-forward because the local branch and its
/// upstream have each gained commits the other doesn't have. Rather than
/// just reporting that as a dead end, walks the user through the two ways
/// out: look at what's actually different, or merge the upstream in now.
export function DivergedPullDialog({
  repo,
  branch,
  upstream,
  open,
  onOpenChange,
  onChanged,
}: {
  repo: Repo;
  branch: string;
  upstream: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  const merge = async () => {
    setMerging(true);
    try {
      const result = await api.mergeBranch(repo.id, upstream);
      if (result.success) {
        toast.success(`Merged ${upstream} into ${branch}`);
        if (result.previousHeadSha && result.newHeadSha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: `Merge ${upstream}`,
            destructive: true,
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
      toast.error(String(e));
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {branch} and {upstream} have diverged
            </AlertDialogTitle>
            <AlertDialogDescription>
              Both have commits the other doesn't, so a plain pull can't fast-forward — merging
              them needs a real merge commit. Take a look at what's different first, or merge{" "}
              {upstream} in now if you already know what changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setCompareOpen(true);
              }}
            >
              <GitCompareArrows className="size-4" /> Compare changes
            </Button>
            <Button onClick={merge} disabled={merging}>
              <GitMerge className="size-4" /> {merging ? "Merging…" : `Merge ${upstream}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompareBranchDialog
        repo={repo}
        base={branch}
        branch={upstream}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </>
  );
}
