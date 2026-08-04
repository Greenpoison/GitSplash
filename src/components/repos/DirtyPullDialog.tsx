import { useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { Archive, Eye, TriangleAlert } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import type { Repo } from "@/lib/types";
import { useUndoStore } from "@/store/undoStore";
import { GitCommandPreview } from "@/components/GitCommandPreview";

/// Shown when "Fetch & pull" fetches fine but skips the pull because the
/// working tree has uncommitted changes — rather than just leaving that as a
/// passive toast, walks a beginner through the real options: temporarily set
/// those changes aside and pull, go look at what's changed first (e.g. to
/// commit it instead), or throw the local changes away entirely and take
/// the remote's version as-is.
export function DirtyPullDialog({
  repo,
  branch,
  upstream,
  open,
  onOpenChange,
  onChanged,
  onViewChanges,
}: {
  repo: Repo;
  branch: string | null;
  upstream: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onViewChanges: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const pushUndo = useUndoStore((s) => s.push);

  const stashPullRestore = async () => {
    setWorking(true);
    try {
      await api.stashPush(repo.id, "Auto-stashed before pull", true);
      try {
        const outcome = await api.fetchRepo(repo.id, true, crypto.randomUUID());
        if (outcome.pulled) {
          toast.success(`Pulled the latest changes for ${repo.displayName}`);
        } else {
          toast.warning(outcome.message ?? "Pulled, but couldn't fast-forward", {
            description: "Your changes are back — try Fetch & pull again to see the options.",
          });
        }
      } finally {
        // Always try to restore, even if the pull itself failed above —
        // leaving the user's work stuck in the stash would be worse than
        // whatever the pull's own failure already is.
        await api.stashPop(repo.id, 0);
      }
      onOpenChange(false);
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setWorking(false);
    }
  };

  const discardAndOverwrite = async () => {
    if (!upstream) return;
    setConfirmOverwriteOpen(false);
    setWorking(true);
    try {
      const previousHeadSha = await api.getHeadSha(repo.id);
      await api.discardAndResetTo(repo.id, upstream);
      const newHeadSha = await api.getHeadSha(repo.id);
      toast.success(`${branch ?? "This branch"} now matches ${upstream} exactly`, {
        description: "Uncommitted changes were discarded — that part can't be undone.",
      });
      if (previousHeadSha && newHeadSha) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Overwrite ${branch ?? "branch"} with ${upstream}`,
          destructive: true,
          undoCommand: `git reset --hard ${previousHeadSha.slice(0, 7)}`,
          redoCommand: `git reset --hard ${newHeadSha.slice(0, 7)}`,
          // Only moves the branch pointer back — any uncommitted edits
          // that were discarded are gone for good, this can't bring them
          // back, just whatever was already committed before this ran.
          undo: () => api.resetTo(repo.id, previousHeadSha, "hard").then(onChanged),
          redo: () => api.resetTo(repo.id, newHeadSha, "hard").then(onChanged),
        });
      }
      onOpenChange(false);
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fetched, but didn't pull</AlertDialogTitle>
          <AlertDialogDescription>
            {branch ? (
              <>
                Your branch <span className="font-mono">{branch}</span> has uncommitted changes,
                so GitSplash didn't pull the latest from{" "}
                <span className="font-mono">{upstream ?? "its upstream"}</span> — doing so could
                overwrite them.
              </>
            ) : (
              "You have uncommitted changes here, so GitSplash didn't try to pull — doing so could overwrite them."
            )}{" "}
            You can set those changes aside temporarily, pull, then get them back; go look at
            what's changed first (e.g. to commit it instead); or discard them entirely and take
            the remote's version as-is.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <GitCommandPreview command={["git stash -u", "git merge --ff-only @{upstream}", "git stash pop"]} />
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onViewChanges();
            }}
          >
            <Eye className="size-4" /> View changes
          </Button>
          {upstream && (
            <Button variant="destructive" onClick={() => setConfirmOverwriteOpen(true)} disabled={working}>
              <TriangleAlert className="size-4" /> Discard & overwrite
            </Button>
          )}
          <Button onClick={stashPullRestore} disabled={working}>
            <Archive className="size-4" /> {working ? "Working…" : "Stash, pull, then restore"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={confirmOverwriteOpen} onOpenChange={setConfirmOverwriteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes and overwrite {branch ?? "this branch"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every uncommitted change here is permanently discarded — there's no undo for that
            part, since it was never committed anywhere. <span className="font-mono">{branch ?? "This branch"}</span>{" "}
            is then moved to exactly match <span className="font-mono">{upstream}</span>,
            including losing any local commits {upstream ? "it" : "you"} may have that aren't on{" "}
            {upstream ?? "the remote"} yet (that part alone can be undone afterward).
          </AlertDialogDescription>
        </AlertDialogHeader>
        {upstream && <GitCommandPreview command={`git reset --hard ${upstream}`} />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={discardAndOverwrite}>Discard & overwrite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
