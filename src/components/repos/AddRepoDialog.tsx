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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function AddRepoDialog() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const groups = useAppStore((s) => s.groups);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);

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
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add repo</Button>
      </DialogTrigger>
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
