import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { Archive, ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { GitCommandPreview } from "@/components/GitCommandPreview";
import * as api from "@/lib/api";
import type { Repo, StashEntry } from "@/lib/types";

/// Stashing sets aside uncommitted changes without a commit — useful for
/// "I need a clean working tree right now but I'm not ready to commit
/// this," e.g. to switch branches or pull. Kept separate from ChangesPanel
/// itself since it manages its own list independently of the file diff.
export function StashPanel({
  repo,
  hasChanges,
  onChanged,
}: {
  repo: Repo;
  hasChanges: boolean;
  onChanged: () => void;
}) {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const [pushOpen, setPushOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [dropTarget, setDropTarget] = useState<StashEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .listStashes(repo.id)
      .then(setStashes)
      .catch(() => setStashes([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const push = async () => {
    setBusy(true);
    try {
      await api.stashPush(repo.id, message.trim() || undefined, includeUntracked);
      toast.success("Stashed changes");
      setPushOpen(false);
      setMessage("");
      setIncludeUntracked(false);
      setCollapsed(false);
      load();
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const pop = async (entry: StashEntry) => {
    setBusy(true);
    try {
      await api.stashPop(repo.id, entry.index);
      toast.success("Applied and removed stash");
      load();
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (entry: StashEntry) => {
    setBusy(true);
    try {
      await api.stashApply(repo.id, entry.index);
      toast.success("Applied stash (kept in the list)");
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const drop = async (entry: StashEntry) => {
    setBusy(true);
    try {
      await api.stashDrop(repo.id, entry.index);
      toast.success("Dropped stash");
      setDropTarget(null);
      load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          Stashes ({stashes.length})
        </button>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 text-xs"
          disabled={!hasChanges || busy}
          onClick={() => setPushOpen(true)}
        >
          <Archive className="size-3" /> Stash changes…
        </Button>
      </div>

      {!collapsed && stashes.length > 0 && (
        <div className="flex flex-col gap-1">
          {stashes.map((s) => (
            <div
              key={s.index}
              className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{s.message}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Apply (keep in list)"
                disabled={busy}
                onClick={() => apply(s)}
              >
                <Download className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                disabled={busy}
                onClick={() => pop(s)}
              >
                Pop
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Drop (permanently discard)"
                disabled={busy}
                onClick={() => setDropTarget(s)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stash changes</DialogTitle>
            <DialogDescription>
              Sets aside everything in your working tree (and index) without committing — pop it
              back later to pick up where you left off.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stash-message">Message (optional)</Label>
              <Input
                id="stash-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. WIP on the sidebar redesign"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={includeUntracked} onCheckedChange={(c) => setIncludeUntracked(!!c)} />
              Include untracked files
            </label>
          </div>
          <DialogFooter>
            <Button onClick={push} disabled={busy}>
              {busy ? "Stashing…" : "Stash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!dropTarget} onOpenChange={(o) => !o && setDropTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop this stash?</AlertDialogTitle>
            <AlertDialogDescription>
              "{dropTarget?.message}" will be permanently discarded — there's no undo for this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dropTarget && <GitCommandPreview command={`git stash drop stash@{${dropTarget.index}}`} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => dropTarget && drop(dropTarget)}>Drop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
