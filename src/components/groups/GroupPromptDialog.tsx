import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

/// A one-shot nudge shown right after the very first repo is added (and no
/// groups exist yet) — driven by the store's groupPromptRepoId rather than
/// the full GroupManagerDialog, since that has list/rename/delete chrome
/// that's just noise for a first-time "want a group for this?" prompt.
export function GroupPromptDialog() {
  const repoId = useAppStore((s) => s.groupPromptRepoId);
  const setRepoId = useAppStore((s) => s.setGroupPromptRepoId);
  const refreshGroups = useAppStore((s) => s.refreshGroups);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const close = (open: boolean) => {
    if (!open) {
      setRepoId(null);
      setName("");
    }
  };

  const create = async () => {
    if (!name.trim() || !repoId) return;
    setCreating(true);
    try {
      const group = await api.createGroup(name.trim());
      await api.setRepoGroups(repoId, [group.id]);
      await Promise.all([refreshGroups(), refreshRepos()]);
      toast.success(`Created "${group.name}" and added the repo to it`);
      close(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={repoId !== null} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Organize it into a group?</DialogTitle>
          <DialogDescription>
            Groups let you batch fetch/pull a whole set of repos at once. You can always add
            or change groups later from "Manage groups".
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="e.g. Work, Personal, Client A"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={creating}>
            Skip for now
          </Button>
          <Button onClick={create} disabled={creating || !name.trim()}>
            {creating ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
