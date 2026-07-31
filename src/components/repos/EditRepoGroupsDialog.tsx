import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { Repo } from "@/lib/types";

export function EditRepoGroupsDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = useAppStore((s) => s.groups);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(repo.groupIds));
  }, [open, repo.groupIds]);

  const save = async () => {
    try {
      await api.setRepoGroups(repo.id, Array.from(selected));
      await refreshRepos();
      onOpenChange(false);
    } catch (e) {
      reportGitError(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Groups for {repo.displayName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">Create a group first.</p>
          )}
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <Checkbox
                id={`edit-group-${g.id}`}
                checked={selected.has(g.id)}
                onCheckedChange={(checked) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(g.id);
                    else next.delete(g.id);
                    return next;
                  });
                }}
              />
              <Label htmlFor={`edit-group-${g.id}`} className="font-normal">
                {g.name}
              </Label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
