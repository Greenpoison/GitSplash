import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { Group } from "@/lib/types";

/// Driven by the store's groupManagerOpen flag — see AddRepoDialog for why.
export function GroupManagerDialog() {
  const open = useAppStore((s) => s.groupManagerOpen);
  const setOpen = useAppStore((s) => s.setGroupManagerOpen);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Group | null>(null);
  const groups = useAppStore((s) => s.groups);
  const refreshGroups = useAppStore((s) => s.refreshGroups);
  const refreshRepos = useAppStore((s) => s.refreshRepos);

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await api.createGroup(newName.trim());
      setNewName("");
      await refreshGroups();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const saveRename = async (id: string, fallbackName: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    if (trimmed === fallbackName) {
      setEditingId(null);
      return;
    }
    try {
      await api.renameGroup(id, trimmed);
      setEditingId(null);
      await refreshGroups();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteGroup(id);
      await Promise.all([refreshGroups(), refreshRepos()]);
      toast.success("Group deleted");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRemoveTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Groups</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              {editingId === g.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveRename(g.id, g.name)}
                  onBlur={() => saveRename(g.id, g.name)}
                  className="h-8"
                />
              ) : (
                <span className="flex-1 text-sm">{g.name}</span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Rename group"
                onClick={() => {
                  setEditingId(g.id);
                  setEditingName(g.name);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Delete group"
                onClick={() => setRemoveTarget(g)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New group name"
          />
          <Button onClick={create} size="icon">
            <Plus className="size-4" />
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{removeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Repos in this group aren't removed from GitSplash — they just become ungrouped. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeTarget && remove(removeTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
