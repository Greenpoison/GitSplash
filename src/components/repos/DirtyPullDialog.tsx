import { useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { Archive, Eye } from "lucide-react";
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
import type { Repo } from "@/lib/types";
import { GitCommandPreview } from "@/components/GitCommandPreview";

/// Shown when "Fetch & pull" fetches fine but skips the pull because the
/// working tree has uncommitted changes — rather than just leaving that as a
/// passive toast, walks a beginner through the two real options: temporarily
/// set those changes aside and pull, or go look at what's actually changed
/// first (e.g. to commit it instead).
export function DirtyPullDialog({
  repo,
  open,
  onOpenChange,
  onChanged,
  onViewChanges,
}: {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onViewChanges: () => void;
}) {
  const [working, setWorking] = useState(false);

  const stashPullRestore = async () => {
    setWorking(true);
    try {
      await api.stashPush(repo.id, "Auto-stashed before pull", true);
      try {
        const outcome = await api.fetchRepo(repo.id, true);
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fetched, but didn't pull</AlertDialogTitle>
          <AlertDialogDescription>
            You have uncommitted changes here, so GitSplash didn't try to pull — doing so could
            overwrite them. You can set those changes aside temporarily, pull, then get them back,
            or go look at what's changed first (e.g. to commit it instead).
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
          <Button onClick={stashPullRestore} disabled={working}>
            <Archive className="size-4" /> {working ? "Working…" : "Stash, pull, then restore"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
