import { useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
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

/// Driven by the store's createRepoDialogOpen flag, same pattern as
/// CloneRepoDialog — see that component for why. Runs a real `git init`
/// rather than just registering an existing folder, for starting a brand
/// new project from scratch.
export function CreateRepoDialog() {
  const open = useAppStore((s) => s.createRepoDialogOpen);
  const setOpen = useAppStore((s) => s.setCreateRepoDialogOpen);
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [initialBranch, setInitialBranch] = useState("main");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const groups = useAppStore((s) => s.groups);
  const repos = useAppStore((s) => s.repos);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const setGroupPromptRepoId = useAppStore((s) => s.setGroupPromptRepoId);

  const pickParentDir = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === "string") setParentDir(selected);
  };

  const reset = () => {
    setParentDir("");
    setFolderName("");
    setDisplayName("");
    setInitialBranch("main");
    setSelectedGroups(new Set());
  };

  const submit = async () => {
    if (!parentDir.trim()) {
      toast.error("Choose where to create it first");
      return;
    }
    if (!folderName.trim()) {
      toast.error("Enter a folder name");
      return;
    }
    if (!initialBranch.trim()) {
      toast.error("Enter an initial branch name");
      return;
    }
    const isFirstRepo = repos.length === 0;
    setSubmitting(true);
    try {
      const repo = await api.initRepo(
        parentDir.trim(),
        folderName.trim(),
        displayName.trim() || undefined,
        initialBranch.trim(),
      );
      if (selectedGroups.size > 0) {
        await api.setRepoGroups(repo.id, Array.from(selectedGroups));
      }
      await refreshRepos();
      await refreshStatuses([repo.id]);
      toast.success(`Created ${repo.displayName}`);
      setOpen(false);
      reset();
      if (isFirstRepo && selectedGroups.size === 0 && groups.length === 0) {
        setGroupPromptRepoId(repo.id);
      }
    } catch (e) {
      reportGitError(e);
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
          <DialogTitle>Create a new repository</DialogTitle>
          <DialogDescription>
            Runs a real `git init` in a new folder, then tracks the result. You can add a GitHub
            remote later once you're ready to push.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="init-parent">Create in</Label>
            <div className="flex gap-2">
              <Input
                id="init-parent"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="D:\code"
              />
              <Button type="button" variant="outline" size="icon" onClick={pickParentDir}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="init-folder">Folder name</Label>
            <Input
              id="init-folder"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="my-new-project"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="init-name">Display name (optional)</Label>
            <Input
              id="init-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to folder name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="init-branch">Initial branch name</Label>
            <Input
              id="init-branch"
              value={initialBranch}
              onChange={(e) => setInitialBranch(e.target.value)}
            />
          </div>
          {groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Groups</Label>
              <div className="flex flex-col gap-2">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`init-group-${g.id}`}
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
                    <Label htmlFor={`init-group-${g.id}`} className="font-normal">
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
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
