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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useBackgroundOpsStore } from "@/store/backgroundOpsStore";

function deriveFolderName(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = trimmed.split(/[/:]/);
  return parts[parts.length - 1] ?? "";
}

/// Driven by the store's cloneRepoDialogOpen flag, same pattern as
/// AddRepoDialog — see that component for why.
export function CloneRepoDialog() {
  const open = useAppStore((s) => s.cloneRepoDialogOpen);
  const setOpen = useAppStore((s) => s.setCloneRepoDialogOpen);
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderNameEdited, setFolderNameEdited] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const groups = useAppStore((s) => s.groups);
  const accounts = useAppStore((s) => s.accounts);
  const repos = useAppStore((s) => s.repos);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const setGroupPromptRepoId = useAppStore((s) => s.setGroupPromptRepoId);
  const startOp = useBackgroundOpsStore((s) => s.start);
  const finishOp = useBackgroundOpsStore((s) => s.finish);

  const pickParentDir = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === "string") setParentDir(selected);
  };

  const reset = () => {
    setUrl("");
    setParentDir("");
    setFolderName("");
    setFolderNameEdited(false);
    setDisplayName("");
    setAccountId("");
    setSelectedGroups(new Set());
  };

  // A slow connection can make a clone take a long time — rather than
  // block this dialog (and effectively the user) on it, close right away
  // and track it as a background operation: a toast that updates from
  // "cloning" to done/failed, plus an entry in the status bar, so the rest
  // of the app stays fully usable while it runs.
  const submit = () => {
    if (!url.trim()) {
      toast.error("Enter a git URL first");
      return;
    }
    if (!parentDir.trim()) {
      toast.error("Choose a destination folder first");
      return;
    }
    if (!folderName.trim()) {
      toast.error("Enter a folder name");
      return;
    }

    const isFirstRepo = repos.length === 0;
    const cloneUrl = url.trim();
    const cloneParentDir = parentDir.trim();
    const cloneFolderName = folderName.trim();
    const cloneDisplayName = displayName.trim() || undefined;
    const cloneAccountId = accountId || undefined;
    const cloneGroups = new Set(selectedGroups);
    const label = `Cloning ${cloneFolderName}…`;
    const opId = startOp(label);

    setOpen(false);
    reset();

    const run = async () => {
      try {
        const repo = await api.cloneRepo(cloneUrl, cloneParentDir, cloneFolderName, cloneDisplayName, cloneAccountId);
        if (cloneGroups.size > 0) {
          await api.setRepoGroups(repo.id, Array.from(cloneGroups));
        }
        await refreshRepos();
        await refreshStatuses([repo.id]);
        finishOp(opId, "success", `Cloned ${repo.displayName}`);
        toast.success(`Cloned ${repo.displayName}`);
        if (isFirstRepo && cloneGroups.size === 0 && groups.length === 0) {
          setGroupPromptRepoId(repo.id);
        }
      } catch (e) {
        finishOp(opId, "error", `Failed to clone ${cloneFolderName}`);
        reportGitError(e);
      }
    };
    run();
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
          <DialogTitle>Clone a repository</DialogTitle>
          <DialogDescription>
            Runs a real git clone, then tracks the result — same as adding an existing folder.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-url">Git URL</Label>
            <Input
              id="clone-url"
              value={url}
              onChange={(e) => {
                const val = e.target.value;
                setUrl(val);
                if (!folderNameEdited) setFolderName(deriveFolderName(val));
              }}
              placeholder="git@github.com:owner/repo.git"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-parent">Clone into</Label>
            <div className="flex gap-2">
              <Input
                id="clone-parent"
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
            <Label htmlFor="clone-folder">Folder name</Label>
            <Input
              id="clone-folder"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setFolderNameEdited(true);
              }}
              placeholder="repo"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-name">Display name (optional)</Label>
            <Input
              id="clone-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to folder name"
            />
          </div>
          {accounts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Account (optional)</Label>
              <Select
                value={accountId || "none"}
                onValueChange={(v) => setAccountId(v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Assign after cloning…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign after cloning…</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Groups</Label>
              <div className="flex flex-col gap-2">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`clone-group-${g.id}`}
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
                    <Label htmlFor={`clone-group-${g.id}`} className="font-normal">
                      {g.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit}>Clone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
