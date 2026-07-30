import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function GroupManagerDialog() {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const groups = useAppStore((s) => s.groups);
  const refreshGroups = useAppStore((s) => s.refreshGroups);

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

  const saveRename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await api.renameGroup(id, editingName.trim());
      setEditingId(null);
      await refreshGroups();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteGroup(id);
      await refreshGroups();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Manage groups
        </Button>
      </DialogTrigger>
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
                  onKeyDown={(e) => e.key === "Enter" && saveRename(g.id)}
                  onBlur={() => saveRename(g.id)}
                  className="h-8"
                />
              ) : (
                <span className="flex-1 text-sm">{g.name}</span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => {
                  setEditingId(g.id);
                  setEditingName(g.name);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => remove(g.id)}>
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
    </Dialog>
  );
}
