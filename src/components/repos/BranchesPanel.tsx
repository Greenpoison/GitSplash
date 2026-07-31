import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Crosshair,
  Eye,
  EyeOff,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import type { BranchInfo, CommitNode, Repo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUndoStore } from "@/store/undoStore";
import { CherryPickDialog } from "./CherryPickDialog";
import { CommitDetailDialog } from "./CommitDetailDialog";
import { CommitGraph } from "./CommitGraph";
import { CompareBranchDialog } from "./CompareBranchDialog";
import { GitflowPanel } from "./GitflowPanel";
import { RebaseDialog } from "./RebaseDialog";

/// Commits reachable from any of `visibleBranches`' tips — walked via
/// `parents` rather than asking git again, since `getCommitGraph` already
/// fetched full topology for the branches in scope. A branch's tip commit
/// is found by matching its name against the `%D`-decoration refs on each
/// node (git prints the checked-out branch as `HEAD -> name`, others as
/// plain `name`).
function filterCommitsByBranches(commits: CommitNode[], visibleBranches: Set<string>): CommitNode[] {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const tipHashes: string[] = [];
  for (const c of commits) {
    for (const ref of c.refs) {
      const name = ref.startsWith("HEAD -> ") ? ref.slice("HEAD -> ".length) : ref;
      if (visibleBranches.has(name)) {
        tipHashes.push(c.hash);
      }
    }
  }

  const reachable = new Set<string>();
  const stack = [...tipHashes];
  while (stack.length > 0) {
    const hash = stack.pop()!;
    if (reachable.has(hash)) continue;
    reachable.add(hash);
    const node = byHash.get(hash);
    if (!node) continue;
    for (const parent of node.parents) {
      if (byHash.has(parent) && !reachable.has(parent)) stack.push(parent);
    }
  }
  return commits.filter((c) => reachable.has(c.hash));
}

export function BranchesPanel({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [hiddenBranches, setHiddenBranches] = useState<Set<string>>(new Set());
  const [soloedBranch, setSoloedBranch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [rebaseInProgress, setRebaseInProgress] = useState(false);
  const [cherryPickOpen, setCherryPickOpen] = useState(false);
  const [cherryPickInProgress, setCherryPickInProgress] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchBase, setNewBranchBase] = useState("");
  const [compareBranch, setCompareBranch] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const pushUndo = useUndoStore((s) => s.push);

  const load = async () => {
    try {
      const [b, c, rebasing, cherryPicking] = await Promise.all([
        api.listBranches(repo.id),
        api.getCommitGraph(repo.id, 60),
        api.getInProgressRebase(repo.id),
        api.getInProgressCherryPick(repo.id),
      ]);
      setBranches(b);
      setCommits(c);
      setRebaseInProgress(!!rebasing);
      setCherryPickInProgress(!!cherryPicking);
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const checkout = async (branch: string) => {
    const previousBranch = current?.name;
    setBusy(true);
    try {
      await api.checkoutBranch(repo.id, branch);
      toast.success(`Switched to ${branch}`);
      if (previousBranch && previousBranch !== branch) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Checkout ${branch}`,
          undo: () => api.checkoutBranch(repo.id, previousBranch).then(() => { load(); onChanged(); }),
          redo: () => api.checkoutBranch(repo.id, branch).then(() => { load(); onChanged(); }),
        });
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    const fromBranch = current?.name;
    setBusy(true);
    try {
      const toBranch = await api.checkoutPreviousBranch(repo.id);
      if (!toBranch) {
        // The switch itself succeeded, but the previous position was a
        // detached commit rather than a named branch — there's no branch
        // name to report or to redo back to, so skip the undo entry.
        toast.success("Switched back to the previous position (detached HEAD)");
      } else {
        toast.success(`Switched back to ${toBranch}`);
        if (fromBranch && fromBranch !== toBranch) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: `Switch back to ${toBranch}`,
            undo: () => api.checkoutBranch(repo.id, fromBranch).then(() => { load(); onChanged(); }),
            redo: () => api.checkoutBranch(repo.id, toBranch).then(() => { load(); onChanged(); }),
          });
        }
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    if (!mergeTarget) return;
    setBusy(true);
    try {
      const result = await api.mergeBranch(repo.id, mergeTarget);
      if (result.success) {
        toast.success(`Merged ${mergeTarget}`);
        if (result.previousHeadSha && result.newHeadSha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: `Merge ${mergeTarget}`,
            destructive: true,
            undo: () =>
              api.resetTo(repo.id, result.previousHeadSha!, "hard").then(() => { load(); onChanged(); }),
            redo: () =>
              api.resetTo(repo.id, result.newHeadSha!, "hard").then(() => { load(); onChanged(); }),
          });
        }
      } else {
        toast.warning(result.message ?? "Merge stopped with conflicts", {
          description: result.conflictedFiles.join(", "),
        });
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createBranch(repo.id, name, newBranchBase || undefined);
      toast.success(`Created and switched to ${name}`);
      setNewBranchOpen(false);
      setNewBranchName("");
      setNewBranchBase("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const current = branches.find((b) => b.isCurrent);

  const visibleBranches = useMemo(() => {
    if (soloedBranch) return new Set([soloedBranch]);
    return new Set(branches.filter((b) => !hiddenBranches.has(b.name)).map((b) => b.name));
  }, [branches, hiddenBranches, soloedBranch]);

  const filteredCommits = useMemo(
    () => (hiddenBranches.size === 0 && !soloedBranch ? commits : filterCommitsByBranches(commits, visibleBranches)),
    [commits, hiddenBranches, soloedBranch, visibleBranches],
  );

  const toggleHidden = (name: string) => {
    setSoloedBranch(null);
    setHiddenBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSolo = (name: string) => {
    setSoloedBranch((prev) => (prev === name ? null : name));
  };

  const blockedByOp = rebaseInProgress || cherryPickInProgress;
  const blockedTitle = rebaseInProgress
    ? "Resolve or abort the in-progress rebase first"
    : cherryPickInProgress
      ? "Resolve or abort the in-progress cherry-pick first"
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <div key={b.name} className="flex items-center gap-0.5">
            <Button
              size="sm"
              variant={b.isCurrent ? "default" : "outline"}
              disabled={busy || b.isCurrent || blockedByOp}
              title={blockedByOp ? blockedTitle : undefined}
              onClick={() => checkout(b.name)}
            >
              {b.name}
              {b.upstream && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {b.upstream}
                </Badge>
              )}
            </Button>
            {!b.isCurrent && current && (
              <Button
                size="icon-sm"
                variant="ghost"
                title={`Compare ${b.name} against ${current.name}`}
                onClick={() => setCompareBranch(b.name)}
              >
                <GitCompareArrows className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={back}
          disabled={busy || blockedByOp}
          title={blockedByOp ? blockedTitle : undefined}
        >
          <ArrowLeft className="size-3.5" /> Checkout previous branch
        </Button>
        <Select value={mergeTarget} onValueChange={setMergeTarget} disabled={blockedByOp}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Merge branch…" />
          </SelectTrigger>
          <SelectContent>
            {branches
              .filter((b) => !b.isCurrent)
              .map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={merge}
          disabled={busy || !mergeTarget || blockedByOp}
          title={blockedByOp ? blockedTitle : undefined}
        >
          <GitMerge className="size-3.5" />
          Merge into {current?.name ?? "current"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNewBranchOpen(true)}
          disabled={busy || blockedByOp}
          title={blockedByOp ? blockedTitle : "Create a plain branch — no naming convention required"}
        >
          <Plus className="size-3.5" />
          New branch…
        </Button>
        <Button
          size="sm"
          variant={rebaseInProgress ? "destructive" : "outline"}
          onClick={() => setRebaseOpen(true)}
          disabled={busy}
        >
          <GitBranchPlus className="size-3.5" />
          {rebaseInProgress ? "Resume rebase" : "Rebase…"}
        </Button>
        <Button
          size="sm"
          variant={cherryPickInProgress ? "destructive" : "outline"}
          onClick={() => setCherryPickOpen(true)}
          disabled={busy}
        >
          <GitCommitHorizontal className="size-3.5" />
          {cherryPickInProgress ? "Resume cherry-pick" : "Cherry-pick…"}
        </Button>
      </div>

      <GitflowPanel repo={repo} branches={branches} onChanged={() => { load(); onChanged(); }} />

      {branches.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Graph:</span>
          {branches.map((b) => {
            const hidden = !visibleBranches.has(b.name);
            return (
              <span
                key={b.name}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                  hidden ? "text-muted-foreground opacity-60" : "border-primary/30 bg-primary/5",
                )}
              >
                <button
                  onClick={() => toggleHidden(b.name)}
                  className="flex items-center gap-1"
                  title={hidden ? `Show ${b.name}` : `Hide ${b.name}`}
                >
                  {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {b.name}
                </button>
                <button
                  onClick={() => toggleSolo(b.name)}
                  className={cn("ml-0.5", soloedBranch === b.name && "text-primary")}
                  title={soloedBranch === b.name ? "Show all branches" : `Solo ${b.name}`}
                >
                  <Crosshair className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <CommitGraph commits={filteredCommits} onSelectCommit={setSelectedCommit} />

      <RebaseDialog
        repo={repo}
        open={rebaseOpen}
        onOpenChange={setRebaseOpen}
        onChanged={() => {
          load();
          onChanged();
        }}
      />
      <CherryPickDialog
        repo={repo}
        open={cherryPickOpen}
        onOpenChange={setCherryPickOpen}
        onChanged={() => {
          load();
          onChanged();
        }}
      />

      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              Any name — not tied to Gitflow's feature/release/hotfix convention.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-branch-name">Name</Label>
              <Input
                id="new-branch-name"
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createBranch()}
                placeholder="my-branch"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Base branch</Label>
              <Select
                value={newBranchBase || "current"}
                onValueChange={(v) => setNewBranchBase(v === "current" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current ({current?.name ?? "HEAD"})</SelectItem>
                  {branches
                    .filter((b) => !b.isCurrent)
                    .map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createBranch} disabled={busy || !newBranchName.trim()}>
              Create &amp; checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {compareBranch && current && (
        <CompareBranchDialog
          repo={repo}
          base={current.name}
          branch={compareBranch}
          open={!!compareBranch}
          onOpenChange={(o) => !o && setCompareBranch(null)}
        />
      )}

      <CommitDetailDialog
        repo={repo}
        commit={selectedCommit}
        open={!!selectedCommit}
        onOpenChange={(o) => !o && setSelectedCommit(null)}
      />
    </div>
  );
}
