import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import {
  ArrowUpDown,
  Download,
  MoreVertical,
  Plus,
  Tag as TagIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as api from "@/lib/api";
import type { CommitNode, Repo, TagInfo } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { CommitDetailDialog } from "./CommitDetailDialog";

type SyncStatus = "synced" | "local-only" | "diverged" | "unknown";

function statusBadge(status: SyncStatus) {
  switch (status) {
    case "synced":
      return (
        <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
          <Download className="size-3" /> on remote
        </Badge>
      );
    case "local-only":
      return <Badge variant="outline">local only</Badge>;
    case "diverged":
      return (
        <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
          <ArrowUpDown className="size-3" /> differs from remote
        </Badge>
      );
    default:
      return null;
  }
}

export function TagsPanel({ repo }: { repo: Repo }) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [remoteTags, setRemoteTags] = useState<Map<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetchingRemote, setFetchingRemote] = useState(false);

  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagTarget, setNewTagTarget] = useState("HEAD");
  const [newTagMessage, setNewTagMessage] = useState("");

  const [moveTarget, setMoveTarget] = useState<TagInfo | null>(null);
  const [moveTo, setMoveTo] = useState("HEAD");

  const [deleteTarget, setDeleteTarget] = useState<TagInfo | null>(null);
  const [deleteRemoteToo, setDeleteRemoteToo] = useState(false);

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);

  const load = async () => {
    try {
      setTags(await api.listTags(repo.id));
    } catch (e) {
      reportGitError(e);
    }
    try {
      const remote = await api.listRemoteTags(repo.id);
      setRemoteTags(new Map(remote.map((t) => [t.name, t.hash])));
    } catch {
      // No network / no remote configured — sync badges just won't show.
      setRemoteTags(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const statusFor = (tag: TagInfo): SyncStatus => {
    if (!remoteTags) return "unknown";
    const remoteHash = remoteTags.get(tag.name);
    if (remoteHash === undefined) return "local-only";
    return remoteHash === tag.hash ? "synced" : "diverged";
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createTag(repo.id, name, newTagTarget.trim() || "HEAD", newTagMessage.trim() || undefined, false);
      toast.success(`Created tag ${name}`);
      setNewTagOpen(false);
      setNewTagName("");
      setNewTagTarget("HEAD");
      setNewTagMessage("");
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const confirmMove = async () => {
    if (!moveTarget) return;
    setBusy(true);
    try {
      await api.createTag(repo.id, moveTarget.name, moveTo.trim() || "HEAD", moveTarget.message ?? undefined, true);
      toast.success(`Moved ${moveTarget.name} to ${moveTo.trim() || "HEAD"}`);
      setMoveTarget(null);
      setMoveTo("HEAD");
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteTag(repo.id, deleteTarget.name);
      if (deleteRemoteToo) {
        await api.deleteRemoteTag(repo.id, deleteTarget.name);
      }
      toast.success(`Deleted tag ${deleteTarget.name}${deleteRemoteToo ? " (local and remote)" : ""}`);
      setDeleteTarget(null);
      setDeleteRemoteToo(false);
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setDeleteRemoteToo(false);
  };

  const pushTag = async (tag: TagInfo) => {
    setBusy(true);
    try {
      await api.pushTag(repo.id, tag.name, false);
      toast.success(`Pushed ${tag.name} to origin`);
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const pushAll = async () => {
    setBusy(true);
    try {
      await api.pushAllTags(repo.id);
      toast.success("Pushed all tags to origin");
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const fetchRemote = async () => {
    setFetchingRemote(true);
    try {
      await api.fetchTags(repo.id);
      toast.success("Fetched latest tags from origin");
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setFetchingRemote(false);
    }
  };

  const explore = async (tag: TagInfo) => {
    try {
      const commit = await api.getCommit(repo.id, tag.hash);
      if (!commit) {
        toast.error(`Couldn't resolve the commit ${tag.name} points to`);
        return;
      }
      setSelectedCommit(commit);
    } catch (e) {
      reportGitError(e);
    }
  };

  const sorted = useMemo(() => tags, [tags]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setNewTagOpen(true)} disabled={busy}>
          <Plus className="size-3.5" /> New tag
        </Button>
        <Button size="sm" variant="outline" onClick={fetchRemote} disabled={fetchingRemote}>
          <Download className="size-3.5" /> {fetchingRemote ? "Fetching…" : "Fetch tags from remote"}
        </Button>
        <Button size="sm" variant="outline" onClick={pushAll} disabled={busy || tags.length === 0}>
          <Upload className="size-3.5" /> Push all tags
        </Button>
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet — create one above.</p>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {sorted.map((tag) => (
            <div key={tag.name} className="flex items-center gap-2 px-3 py-2">
              <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                onClick={() => explore(tag)}
                className="min-w-0 truncate text-left font-mono text-sm font-medium hover:underline"
                title="Explore this tag's commit"
              >
                {tag.name}
              </button>
              {tag.isAnnotated && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  annotated
                </Badge>
              )}
              {statusBadge(statusFor(tag))}
              {tag.message && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{tag.message}</span>
              )}
              <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                {tag.hash.slice(0, 7)}
              </span>
              {tag.date && (
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {relativeTime(tag.date)}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" title="Tag actions">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => explore(tag)}>Explore commit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => pushTag(tag)}>Push to remote</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setMoveTarget(tag);
                      setMoveTo(tag.hash);
                    }}
                  >
                    Move…
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(tag)}>
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* New tag */}
      <Dialog open={newTagOpen} onOpenChange={setNewTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>
              Leave the message blank for a lightweight tag, or fill it in for an annotated one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="v1.2.0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tag-target">Target commit</Label>
              <Input
                id="tag-target"
                value={newTagTarget}
                onChange={(e) => setNewTagTarget(e.target.value)}
                placeholder="HEAD"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tag-message">Message (optional — makes it annotated)</Label>
              <Input
                id="tag-message"
                value={newTagMessage}
                onChange={(e) => setNewTagMessage(e.target.value)}
                placeholder="Release 1.2.0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createTag} disabled={busy || !newTagName.trim()}>
              Create tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move tag */}
      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move <span className="font-mono">{moveTarget?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Re-points the tag at a different commit, overwriting where it currently points. Doesn't touch the
              remote until you push it again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-move-target">New target commit</Label>
            <Input id="tag-move-target" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={confirmMove} disabled={busy || !moveTo.trim()}>
              Move tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete tag */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the local tag. It'll stay on the remote unless you also delete it there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="delete-remote-too"
              checked={deleteRemoteToo}
              onCheckedChange={(c) => setDeleteRemoteToo(!!c)}
            />
            <Label htmlFor="delete-remote-too" className="font-normal">
              Also delete from origin
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CommitDetailDialog
        repo={repo}
        commit={selectedCommit}
        open={!!selectedCommit}
        onOpenChange={(o) => !o && setSelectedCommit(null)}
      />
    </div>
  );
}
