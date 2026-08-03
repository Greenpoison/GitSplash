import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  Info,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { BranchInfo, CommitNode, GitflowKind, Repo } from "@/lib/types";
import { GITFLOW_DEFAULT_BASE } from "@/lib/gitflow";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useUndoStore } from "@/store/undoStore";
import { CherryPickDialog } from "./CherryPickDialog";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import { CommitDetailDialog } from "./CommitDetailDialog";
import { CommitGraph } from "./CommitGraph";
import { CompareBranchDialog } from "./CompareBranchDialog";
import { MergeBranchDialog } from "./MergeBranchDialog";
import { MultiBranchCompareDialog } from "./MultiBranchCompareDialog";
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
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
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
  const [newBranchAdvancedOpen, setNewBranchAdvancedOpen] = useState(false);
  const [newBranchKind, setNewBranchKind] = useState<GitflowKind | "none">("none");
  const [compareBranch, setCompareBranch] = useState<string | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [showMerged, setShowMerged] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [multiCompareOpen, setMultiCompareOpen] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<{ name: string; message: string } | null>(null);
  const pushUndo = useUndoStore((s) => s.push);
  const status = useAppStore((s) => s.statuses[repo.id]);

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
      reportGitError(e);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const checkout = async (branch: string, isRemote = false) => {
    const previousBranch = current?.name;
    // A remote-only entry's `name` is the full remote ref (e.g.
    // "origin/feature/x") — after this checkout it exists as a local branch
    // under its short name, so undo/redo (which run later, once that local
    // branch is real) should target that short name with a plain checkout.
    const localName = isRemote ? branch.slice(branch.indexOf("/") + 1) : branch;
    setBusy(true);
    try {
      await api.checkoutBranch(repo.id, branch, isRemote);
      toast.success(`Switched to ${localName}`);
      if (previousBranch && previousBranch !== localName) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Checkout ${localName}`,
          undo: () => api.checkoutBranch(repo.id, previousBranch).then(() => { load(); onChanged(); }),
          redo: () => api.checkoutBranch(repo.id, localName).then(() => { load(); onChanged(); }),
        });
      }
      await load();
      onChanged();
    } catch (e) {
      reportGitError(e);
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
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (newBranchKind === "none") {
        await api.createBranch(repo.id, name, newBranchBase || undefined);
        toast.success(`Created and switched to ${name}`);
      } else {
        const base = newBranchBase.trim() || GITFLOW_DEFAULT_BASE[newBranchKind];
        await api.startGitflowBranch(repo.id, newBranchKind, name, base);
        toast.success(`Started ${newBranchKind}/${name}`);
      }
      setNewBranchOpen(false);
      setNewBranchName("");
      setNewBranchBase("");
      setNewBranchKind("none");
      setNewBranchAdvancedOpen(false);
      await load();
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  const deleteBranch = async (name: string, force: boolean) => {
    setBusy(true);
    try {
      const sha = await api.resolveRef(repo.id, name).catch(() => null);
      await api.deleteBranch(repo.id, name, force);
      toast.success(`Deleted ${name}`);
      setDeleteTarget(null);
      setForceDeleteTarget(null);
      if (sha) {
        pushUndo({
          id: crypto.randomUUID(),
          repoId: repo.id,
          label: `Delete ${name}`,
          destructive: true,
          undoCommand: `git branch ${name} ${sha.slice(0, 7)}`,
          redoCommand: `git branch ${force ? "-D" : "-d"} ${name}`,
          undo: () => api.createBranchAt(repo.id, name, sha).then(() => { load(); onChanged(); }),
          redo: () => api.deleteBranch(repo.id, name, force).then(() => { load(); onChanged(); }),
        });
      }
      await load();
      onChanged();
    } catch (e) {
      if (!force) {
        // Git's own safe-delete refusal, almost always "not fully merged" —
        // offer to force it instead of just dead-ending on the error.
        setDeleteTarget(null);
        setForceDeleteTarget({ name, message: String(e) });
      } else {
        reportGitError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const current = branches.find((b) => b.isCurrent);

  // Remote-only entries (a fetched branch with no local copy yet) are shown
  // in the switcher list and offered as rebase targets, but everything else
  // here — merge, gitflow, comparison, the commit graph — expects real local
  // branches, so they're scoped out of those.
  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches]);

  const mergedCount = useMemo(
    () => branches.filter((b) => b.isMerged && !b.isCurrent).length,
    [branches],
  );

  const goneBranches = useMemo(() => branches.filter((b) => b.isGone), [branches]);

  const cleanupGoneBranches = async () => {
    setCleanupOpen(false);
    setBusy(true);
    let succeeded = 0;
    for (const b of goneBranches) {
      try {
        const sha = await api.resolveRef(repo.id, b.name).catch(() => null);
        await api.deleteBranch(repo.id, b.name, false);
        succeeded++;
        if (sha) {
          pushUndo({
            id: crypto.randomUUID(),
            repoId: repo.id,
            label: `Delete ${b.name}`,
            destructive: true,
            undoCommand: `git branch ${b.name} ${sha.slice(0, 7)}`,
            redoCommand: `git branch -d ${b.name}`,
            undo: () => api.createBranchAt(repo.id, b.name, sha).then(() => { load(); onChanged(); }),
            redo: () => api.deleteBranch(repo.id, b.name, false).then(() => { load(); onChanged(); }),
          });
        }
      } catch (e) {
        reportGitError(e);
      }
    }
    if (succeeded > 0) {
      toast.success(`Deleted ${succeeded} branch${succeeded === 1 ? "" : "es"} whose remote was gone`);
    }
    await load();
    onChanged();
    setBusy(false);
  };

  const filteredBranches = useMemo(() => {
    const q = branchQuery.trim().toLowerCase();
    // A branch search should look across everything, merged or not — only
    // the default, unfiltered view hides already-merged branches to keep
    // the chip list from piling up with dead branches after every merge.
    if (q) return branches.filter((b) => b.name.toLowerCase().includes(q));
    return showMerged ? branches : branches.filter((b) => !b.isMerged || b.isCurrent);
  }, [branches, branchQuery, showMerged]);

  const visibleBranches = useMemo(() => {
    if (soloedBranch) return new Set([soloedBranch]);
    return new Set(localBranches.filter((b) => !hiddenBranches.has(b.name)).map((b) => b.name));
  }, [localBranches, hiddenBranches, soloedBranch]);

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
      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <GitBranch className="size-4 text-muted-foreground" />
          <span>
            You're on <span className="font-mono font-semibold">{current.name}</span>
          </span>
          {status?.upstream && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {status.upstream}
            </Badge>
          )}
          {status && status.ahead > 0 && (
            <Badge variant="outline" className="gap-1">
              <ArrowUp className="size-3" />
              {status.ahead}
            </Badge>
          )}
          {status && status.behind > 0 && (
            <Badge variant="outline" className="gap-1">
              <ArrowDown className="size-3" />
              {status.behind}
            </Badge>
          )}
          {status && !status.hasUpstream && (
            <span className="text-xs text-muted-foreground">not published yet</span>
          )}
        </div>
      )}
      {goneBranches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <Trash2 className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {goneBranches.length} local branch{goneBranches.length === 1 ? "" : "es"} already merged,
            with no branch left on any remote — most likely deleted on GitHub after merging. Safe to
            delete your local copy too.
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setCleanupOpen(true)}>
            Delete local {goneBranches.length === 1 ? "branch" : `${goneBranches.length} branches`}
          </Button>
        </div>
      )}
      {(branches.length > 5 || mergedCount > 0) && (
        <div className="flex items-center gap-2">
          {branches.length > 5 && (
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={branchQuery}
                onChange={(e) => setBranchQuery(e.target.value)}
                placeholder="Filter branches…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          )}
          {mergedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setShowMerged((v) => !v)}
            >
              {showMerged ? "Hide merged" : `Show merged (${mergedCount})`}
            </Button>
          )}
        </div>
      )}
      <div className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border">
        {filteredBranches.map((b) => {
          const disabled = busy || b.isCurrent || blockedByOp;
          return (
            <div
              key={b.name}
              className={cn("group flex items-center gap-2 px-3 py-2 text-sm", b.isCurrent && "bg-primary/5")}
            >
              <button
                type="button"
                disabled={disabled}
                title={blockedByOp ? blockedTitle : b.isCurrent ? undefined : `Switch to ${b.name}`}
                onClick={() => checkout(b.name, b.isRemote)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 text-left",
                  !disabled && "cursor-pointer hover:text-primary",
                )}
              >
                {b.isCurrent ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
                <span className={cn("truncate font-mono", b.isCurrent && "font-semibold")}>{b.name}</span>
                {b.isRemote && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    remote only
                  </Badge>
                )}
                {b.upstream && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {b.upstream}
                  </Badge>
                )}
                {b.isGone && (
                  <Badge variant="outline" className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                    remote deleted
                  </Badge>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
                {!b.isCurrent && !b.isRemote && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={`Delete ${b.name}`}
                    disabled={busy}
                    onClick={() => setDeleteTarget(b.name)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={back}
          disabled={busy || blockedByOp}
          title={blockedByOp ? blockedTitle : undefined}
        >
          <ArrowLeft className="size-3.5" /> Checkout previous branch
        </Button>
        <Button
          size="sm"
          onClick={() => setMergeDialogOpen(true)}
          disabled={busy || localBranches.length < 2 || blockedByOp}
          title={blockedByOp ? blockedTitle : undefined}
        >
          <GitMerge className="size-3.5" />
          Merge…
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
        {rebaseInProgress && (
          <Button size="sm" variant="destructive" onClick={() => setRebaseOpen(true)} disabled={busy}>
            <GitBranchPlus className="size-3.5" />
            Resume rebase
          </Button>
        )}
        {cherryPickInProgress && (
          <Button size="sm" variant="destructive" onClick={() => setCherryPickOpen(true)} disabled={busy}>
            <GitCommitHorizontal className="size-3.5" />
            Resume cherry-pick
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              More
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setRebaseOpen(true)} disabled={rebaseInProgress}>
              <GitBranchPlus className="size-3.5" /> Rebase…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCherryPickOpen(true)} disabled={cherryPickInProgress}>
              <GitCommitHorizontal className="size-3.5" /> Cherry-pick…
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setMultiCompareOpen(true)}
              disabled={localBranches.length < 2}
            >
              <GitCompareArrows className="size-3.5" /> Compare branches…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GitflowPanel repo={repo} branches={localBranches} onChanged={() => { load(); onChanged(); }} />

      {localBranches.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Graph:</span>
          {localBranches.map((b) => {
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

      <CommitGraph commits={filteredCommits} branches={localBranches} onSelectCommit={setSelectedCommit} />

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

      <Dialog
        open={newBranchOpen}
        onOpenChange={(open) => {
          setNewBranchOpen(open);
          if (!open) {
            setNewBranchKind("none");
            setNewBranchAdvancedOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              {newBranchKind === "none"
                ? "Any name — branches off the base below."
                : `Will create ${newBranchKind}/${newBranchName.trim() || "…"} and check it out.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-branch-name">Name</Label>
              <div className="flex items-center gap-1.5">
                {newBranchKind !== "none" && (
                  <span className="font-mono text-xs text-muted-foreground">{newBranchKind}/</span>
                )}
                <Input
                  id="new-branch-name"
                  autoFocus
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createBranch()}
                  placeholder={newBranchKind === "none" ? "my-branch" : "my-feature"}
                />
              </div>
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
                  {localBranches
                    .filter((b) => !b.isCurrent)
                    .map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={() => setNewBranchAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", newBranchAdvancedOpen && "rotate-180")} />
              Advanced
            </button>
            {newBranchAdvancedOpen && (
              <div className="flex flex-col gap-1.5 rounded-md border p-2">
                <Label className="flex items-center gap-1.5 text-xs">
                  Gitflow type
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      Names the branch <span className="font-mono">type/name</span> and picks a
                      sensible base — feature/release off develop, hotfix off main. GitSplash will
                      later offer to "finish" it (merge into its targets, optionally tag, delete).
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select
                  value={newBranchKind}
                  onValueChange={(v) => {
                    const k = v as GitflowKind | "none";
                    setNewBranchKind(k);
                    if (k !== "none" && branches.some((b) => b.name === GITFLOW_DEFAULT_BASE[k])) {
                      setNewBranchBase(GITFLOW_DEFAULT_BASE[k]);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Plain branch</SelectItem>
                    <SelectItem value="feature">feature</SelectItem>
                    <SelectItem value="release">release</SelectItem>
                    <SelectItem value="hotfix">hotfix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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

      <MultiBranchCompareDialog
        repo={repo}
        branches={localBranches}
        open={multiCompareOpen}
        onOpenChange={setMultiCompareOpen}
      />

      <MergeBranchDialog
        repo={repo}
        branches={localBranches}
        current={current}
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        onChanged={() => {
          load();
          onChanged();
        }}
      />

      <CommitDetailDialog
        repo={repo}
        commit={selectedCommit}
        open={!!selectedCommit}
        onOpenChange={(o) => !o && setSelectedCommit(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              This only deletes the local branch — its remote counterpart, if any, is untouched.
              Refused if it has commits not reachable from anywhere else.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && <GitCommandPreview command={`git branch -d ${deleteTarget}`} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteBranch(deleteTarget, false)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!forceDeleteTarget} onOpenChange={(o) => !o && setForceDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force delete {forceDeleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {forceDeleteTarget?.message} Forcing it through permanently discards any commits on
              this branch that aren't reachable from anywhere else — there's no undo for that.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {forceDeleteTarget && (
            <GitCommandPreview command={`git branch -D ${forceDeleteTarget.name}`} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => forceDeleteTarget && deleteBranch(forceDeleteTarget.name, true)}>
              Force delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {goneBranches.length} local branch{goneBranches.length === 1 ? "" : "es"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These only exist locally now — they're already merged, and no branch by that name
              exists on any remote anymore (most likely deleted on GitHub after their pull request
              was merged). This won't touch GitHub or anything else remote. Each deletion can still
              be undone individually afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
            {goneBranches.map((b) => (
              <div key={b.name}>{b.name}</div>
            ))}
          </div>
          <GitCommandPreview command={goneBranches.map((b) => `git branch -d ${b.name}`)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={cleanupGoneBranches}>Delete all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
