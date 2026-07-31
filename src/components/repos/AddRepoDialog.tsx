import { useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

/// Driven entirely by the store's addRepoDialogOpen flag (rather than local
/// state) so keyboard shortcuts and the command palette can open it too,
/// not just its own trigger button.
export function AddRepoDialog() {
  const open = useAppStore((s) => s.addRepoDialogOpen);
  const setOpen = useAppStore((s) => s.setAddRepoDialogOpen);
  const [path, setPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const groups = useAppStore((s) => s.groups);
  const repos = useAppStore((s) => s.repos);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const setGroupPromptRepoId = useAppStore((s) => s.setGroupPromptRepoId);

  const pickFolder = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === "string") setPath(selected);
  };

  const reset = () => {
    setPath("");
    setDisplayName("");
    setSelectedGroups(new Set());
  };

  const submit = async () => {
    if (!path.trim()) {
      toast.error("Choose or enter a repo path first");
      return;
    }
    const isFirstRepo = repos.length === 0;
    setSubmitting(true);
    try {
      const repo = await api.addRepo(path.trim(), displayName.trim() || undefined);
      if (selectedGroups.size > 0) {
        await api.setRepoGroups(repo.id, Array.from(selectedGroups));
      }
      await refreshRepos();
      await refreshStatuses([repo.id]);
      toast.success(`Added ${repo.displayName}`);
      setOpen(false);
      reset();
      // Nudge toward organizing repos into groups right after the very
      // first one is added, but only if they didn't already pick a group
      // above and no groups exist yet — otherwise this would nag on every
      // add.
      if (isFirstRepo && selectedGroups.size === 0 && groups.length === 0) {
        setGroupPromptRepoId(repo.id);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a repository</DialogTitle>
          <DialogDescription>
            GitSplash only tracks repos you explicitly add here — nothing else on disk is scanned.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-path">Local path</Label>
            <div className="flex gap-2">
              <Input
                id="repo-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="D:\code\some-repo"
              />
              <Button type="button" variant="outline" size="icon" onClick={pickFolder}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-name">Display name (optional)</Label>
            <Input
              id="repo-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to folder name"
            />
          </div>
          {groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Groups</Label>
              <div className="flex flex-col gap-2">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`group-${g.id}`}
                      checked={selectedGroups.has(g.id)}
                      onCheckedChange={(checked) => {
                        setSelectedGroups((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(g.id);
                          else next.delete(g.id);
                          return next;
                        });
                      }}
                    />
                    <Label htmlFor={`group-${g.id}`} className="font-normal">
                      {g.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Adding…" : "Add repo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
