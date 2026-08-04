import { useState } from "react";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { reportGitError, translateGitError } from "@/lib/gitErrors";
import { showGitProgressToast, type GitToastState } from "@/components/GitProgressToast";
import type { GitProgress } from "@/lib/types";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitPullRequestArrow,
  Loader2,
  MoreVertical,
  Stethoscope,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GitCommandTooltip } from "@/components/GitCommandTooltip";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { displayPath, relativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";
import { EditRepoGroupsDialog } from "@/components/repos/EditRepoGroupsDialog";
import { RepoDetailDialog } from "@/components/repos/RepoDetailDialog";
import { DivergedPullDialog } from "@/components/repos/DivergedPullDialog";
import { RepoHealthDialog } from "@/components/repos/RepoHealthDialog";
import { CompareBranchDialog } from "@/components/repos/CompareBranchDialog";
import { DirtyPullDialog } from "@/components/repos/DirtyPullDialog";

export function RepoCard({ repo }: { repo: Repo }) {
  const status = useAppStore((s) => s.statuses[repo.id]);
  const accounts = useAppStore((s) => s.accounts);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const [editGroupsOpen, setEditGroupsOpen] = useState(false);
  const [healthCheckOpen, setHealthCheckOpen] = useState(false);
  // Lifted to the global store (rather than local state) so the Command
  // Palette can jump straight into a specific repo's detail dialog from
  // anywhere, not just by clicking its card here.
  const detailOpen = useAppStore((s) => s.openRepoDetailId === repo.id);
  const setOpenRepoDetailId = useAppStore((s) => s.setOpenRepoDetailId);
  const setDetailOpen = (open: boolean) => setOpenRepoDetailId(open ? repo.id : null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [forcePushConfirm, setForcePushConfirm] = useState(false);
  const [diverged, setDiverged] = useState<{ branch: string; upstream: string } | null>(null);
  const [dirtyPull, setDirtyPull] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDefaultOpen, setCompareDefaultOpen] = useState(false);

  const account = accounts.find((a) => a.id === repo.accountId);

  const doFetch = async (pull: boolean) => {
    setFetching(true);
    const opId = crypto.randomUUID();
    const label = pull ? "Fetch & pull" : "Fetch";
    // Most fetches are near-instant (nothing new, or a handful of objects)
    // and don't deserve a toast of their own — only show/update one once a
    // "fetch-progress" event actually arrives, i.e. there's real transfer
    // happening worth watching.
    let sawProgress = false;
    const finishProgressToast = (state: GitToastState) => {
      if (sawProgress) showGitProgressToast(opId, `${label} ${repo.displayName}`, state);
    };
    const unlisten = await listen<GitProgress>("fetch-progress", (event) => {
      if (event.payload.opId !== opId) return;
      sawProgress = true;
      const { stage, percent } = event.payload;
      showGitProgressToast(opId, `${label} ${repo.displayName}…`, { variant: "progress", stage, percent });
    });
    try {
      const outcome = await api.fetchRepo(repo.id, pull, opId);
      if (!outcome.fetched) {
        const { message, hint } = translateGitError(outcome.message ?? "Fetch failed");
        finishProgressToast({ variant: "error", message, hint });
        toast.error(message, hint ? { description: hint } : undefined);
      } else if (outcome.diverged && outcome.upstream && (outcome.branch ?? status?.branch)) {
        // Prefer the branch name the fetch itself resolved over the
        // separately cached status snapshot — that can lag behind a fetch
        // just run (e.g. right after adding a repo, before its first
        // background refresh), which previously made this fall through to
        // a plain "branch and upstream have diverged" toast instead of this
        // dialog. DivergedPullDialog uses this as a real git ref (it's the
        // compare/merge base), so there's no safe placeholder if both are
        // somehow missing — fall through to the toast instead.
        finishProgressToast({ variant: "success", message: `${label} finished for ${repo.displayName}` });
        setDiverged({ branch: (outcome.branch ?? status?.branch)!, upstream: outcome.upstream });
      } else if (pull && outcome.dirty) {
        finishProgressToast({ variant: "success", message: `${label} finished for ${repo.displayName}` });
        setDirtyPull(true);
      } else if (pull && !outcome.pulled && outcome.message?.includes("no upstream")) {
        finishProgressToast({ variant: "success", message: `${label} finished for ${repo.displayName}` });
        toast.warning("This branch isn't published yet, so there's nothing to pull from.", {
          description: "Use the Push button to publish it to the remote first.",
        });
      } else if (pull && !outcome.pulled) {
        finishProgressToast({ variant: "success", message: `${label} finished for ${repo.displayName}` });
        const { message, hint } = translateGitError(outcome.message ?? "Fetched, but didn't pull");
        toast.warning(message, { description: hint ?? repo.displayName });
      } else {
        finishProgressToast({ variant: "success", message: `${label} finished for ${repo.displayName}` });
        toast.success(`${pull ? "Fetch & pull" : "Fetch"} finished for ${repo.displayName}`);
      }
      await Promise.all([refreshRepos(), refreshStatuses([repo.id])]);
    } catch (e) {
      const { message, hint } = translateGitError(String(e));
      finishProgressToast({ variant: "error", message, hint });
      reportGitError(e);
    } finally {
      unlisten();
      setFetching(false);
    }
  };

  const doPush = async (force: boolean) => {
    setPushing(true);
    const opId = crypto.randomUUID();
    const label = force ? "Force push" : "Push";
    let sawProgress = false;
    const finishProgressToast = (state: GitToastState) => {
      if (sawProgress) showGitProgressToast(opId, `${label} ${repo.displayName}`, state);
    };
    const unlisten = await listen<GitProgress>("push-progress", (event) => {
      if (event.payload.opId !== opId) return;
      sawProgress = true;
      const { stage, percent } = event.payload;
      showGitProgressToast(opId, `${label} ${repo.displayName}…`, { variant: "progress", stage, percent });
    });
    try {
      const outcome = await api.pushRepo(repo.id, force, opId);
      if (!outcome.pushed) {
        if (outcome.rejected) {
          finishProgressToast({
            variant: "error",
            message: "Push rejected — the remote has commits you don't have yet",
            hint: "Fetch & pull first, then push again.",
          });
          toast.error("Push rejected — the remote has commits you don't have yet", {
            description: "Fetch & pull first, then push again.",
          });
        } else {
          const { message, hint } = translateGitError(outcome.message ?? "Push failed");
          finishProgressToast({ variant: "error", message, hint });
          toast.error(message, hint ? { description: hint } : undefined);
        }
      } else {
        const successMessage = outcome.setUpstream
          ? `Published ${repo.displayName} to origin`
          : `Pushed ${repo.displayName}`;
        finishProgressToast({ variant: "success", message: successMessage });
        toast.success(successMessage);
      }
      await refreshStatuses([repo.id]);
    } catch (e) {
      const { message, hint } = translateGitError(String(e));
      finishProgressToast({ variant: "error", message, hint });
      reportGitError(e);
    } finally {
      unlisten();
      setPushing(false);
      setForcePushConfirm(false);
    }
  };

  const assign = async (accountId: string | null) => {
    try {
      await api.assignRepoAccount(repo.id, accountId);
      await refreshRepos();
      toast.success(accountId ? "Account assigned" : "Account cleared");
    } catch (e) {
      reportGitError(e);
    }
  };

  const remove = async () => {
    try {
      await api.removeRepo(repo.id);
      await refreshRepos();
      toast.success(`Removed ${repo.displayName} from GitSplash (files untouched)`);
    } catch (e) {
      reportGitError(e);
    }
  };

  // One contextual "sync" action instead of three always-visible icons —
  // matches the GitHub Desktop convention of a single button that adapts to
  // what the branch actually needs right now, with the individual explicit
  // actions still one click away via the dropdown for anyone who wants to
  // fetch/pull/push separately.
  const noUpstream = !status?.hasUpstream;
  const behind = status?.behind ?? 0;
  const ahead = status?.ahead ?? 0;
  let syncLabel: string;
  let syncCommand: string | string[];
  let SyncIcon = Download;
  let runSync: () => void;
  if (noUpstream) {
    syncLabel = "Publish branch";
    syncCommand = `git push -u origin ${status?.branch ?? "<branch>"}`;
    SyncIcon = Upload;
    runSync = () => doPush(false);
  } else if (behind > 0) {
    syncLabel = `Pull (${behind} behind)`;
    syncCommand = ["git fetch --prune", "git merge --ff-only @{upstream}"];
    SyncIcon = GitPullRequestArrow;
    runSync = () => doFetch(true);
  } else if (ahead > 0) {
    syncLabel = `Push (${ahead} ahead)`;
    syncCommand = "git push";
    SyncIcon = Upload;
    runSync = () => doPush(false);
  } else {
    syncLabel = "Fetch";
    syncCommand = "git fetch --prune";
    SyncIcon = Download;
    runSync = () => doFetch(false);
  }
  const syncBusy = fetching || pushing;

  return (
    <Card
      className="flex cursor-pointer flex-row items-center gap-4 px-4 py-3"
      onClick={() => setDetailOpen(true)}
      title="View repo details"
      data-tutorial="repo-card"
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium">{repo.displayName}</span>
          {account && (
            <Badge variant="outline" className="text-[10px]">
              {account.name}
            </Badge>
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground max-w-md">{displayPath(repo.path)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {status?.error ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" /> {status.error}
          </Badge>
        ) : status ? (
          <>
            <Badge variant="secondary">{status.branch ?? "detached"}</Badge>
            {(status.ahead > 0 || status.behind > 0) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (status.branch && status.upstream) setCompareOpen(true);
                }}
                title={
                  status.branch && status.upstream
                    ? `Compare ${status.branch} against ${status.upstream}`
                    : undefined
                }
                className="flex items-center gap-1"
              >
                {status.ahead > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <ArrowUp className="size-3" />
                    {status.ahead}
                  </Badge>
                )}
                {status.behind > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <ArrowDown className="size-3" />
                    {status.behind}
                  </Badge>
                )}
              </button>
            )}
            {/* Distinct from the ahead/behind badge above, which compares
                against this branch's own upstream (usually itself, or
                nothing, for a feature branch) — these instead flag when
                this branch and the repo's actual default branch have
                diverged from each other. "Behind" reuses the same
                diverged-pull dialog/merge flow, since main moving on is
                fixed by merging it in. "Ahead" has nothing to merge FROM
                main, so it opens a read-only compare instead — it's really
                surfacing "this has finished work main doesn't have yet". */}
            {status.behindDefault > 0 && status.defaultBranch && status.branch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDiverged({ branch: status.branch!, upstream: `origin/${status.defaultBranch}` });
                }}
                title={`${status.branch} is ${status.behindDefault} commit${status.behindDefault === 1 ? "" : "s"} behind ${status.defaultBranch}`}
              >
                <Badge variant="outline" className="gap-1 text-blue-600 dark:text-blue-400">
                  <GitBranch className="size-3" />
                  {status.behindDefault} behind {status.defaultBranch}
                </Badge>
              </button>
            )}
            {status.aheadDefault > 0 && status.defaultBranch && status.branch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCompareDefaultOpen(true);
                }}
                title={`${status.branch} is ${status.aheadDefault} commit${status.aheadDefault === 1 ? "" : "s"} ahead of ${status.defaultBranch}`}
              >
                <Badge variant="outline" className="gap-1 text-violet-600 dark:text-violet-400">
                  <GitBranch className="size-3" />
                  {status.aheadDefault} ahead of {status.defaultBranch}
                </Badge>
              </button>
            )}
            {status.isDirty ? (
              <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                dirty
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> clean
              </Badge>
            )}
          </>
        ) : (
          <Badge variant="outline">loading…</Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-20 text-right text-xs text-muted-foreground">
              {relativeTime(repo.lastFetchedAt)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Last fetched:{" "}
            {repo.lastFetchedAt ? new Date(repo.lastFetchedAt).toLocaleString() : "never — GitSplash hasn't fetched this repo yet"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="relative">
        <GitCommandTooltip label={syncLabel} command={syncCommand}>
          <Button
            variant="ghost"
            size="icon"
            disabled={syncBusy || !status || !status.branch}
            onClick={(e) => {
              e.stopPropagation();
              runSync();
            }}
          >
            {syncBusy ? <Loader2 className="size-4 animate-spin" /> : <SyncIcon className="size-4" />}
          </Button>
        </GitCommandTooltip>
        {!syncBusy && (behind > 0 || ahead > 0) && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
            {behind > 0 ? behind : ahead}
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title="More sync actions"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem disabled={fetching} onClick={() => doFetch(false)}>
            <Download className="size-4" /> Fetch
          </DropdownMenuItem>
          <DropdownMenuItem disabled={fetching} onClick={() => doFetch(true)}>
            <GitPullRequestArrow className="size-4" /> Fetch & pull
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pushing || !status?.branch} onClick={() => doPush(false)}>
            <Upload className="size-4" /> {status?.hasUpstream ? "Push" : "Publish branch"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          api.openRepoExternal(repo.id).catch((err) => reportGitError(err));
        }}
        title="Open in git GUI / file explorer"
      >
        <FolderOpen className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="More actions"
            data-tutorial="repo-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Radix portals this out of the DOM tree, but React still bubbles
            synthetic events through the JSX tree, not the DOM tree — so
            without this, clicking any item here would also re-trigger the
            card's own onClick since this is still its React descendant. */}
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => api.openRepoExternal(repo.id)}>
            <ExternalLink className="size-4" /> Open externally
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditGroupsOpen(true)}>Edit groups</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHealthCheckOpen(true)}>
            <Stethoscope className="size-4" /> Check repo health
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assign account</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={repo.accountId ?? "none"}
                onValueChange={(v) => assign(v === "none" ? null : v)}
              >
                <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                {accounts.map((a) => (
                  <DropdownMenuRadioItem key={a.id} value={a.id}>
                    {a.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="cursor-default text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Danger zone
          </DropdownMenuLabel>
          <DropdownMenuItem
            variant="destructive"
            disabled={!status?.hasUpstream}
            onClick={() => setForcePushConfirm(true)}
          >
            Force push…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
            Remove from GitSplash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Wrapped in a plain stopPropagation div for the same reason as
          DropdownMenuContent above — these portal elsewhere in the DOM but
          are still React descendants of the clickable card. */}
      <div onClick={(e) => e.stopPropagation()}>
        <EditRepoGroupsDialog repo={repo} open={editGroupsOpen} onOpenChange={setEditGroupsOpen} />
        <RepoHealthDialog repo={repo} open={healthCheckOpen} onOpenChange={setHealthCheckOpen} />
        <RepoDetailDialog repo={repo} open={detailOpen} onOpenChange={setDetailOpen} />
        {status?.branch && status.upstream && (
          <CompareBranchDialog
            repo={repo}
            base={status.branch}
            branch={status.upstream}
            open={compareOpen}
            onOpenChange={setCompareOpen}
          />
        )}
        {status?.branch && status.defaultBranch && (
          <CompareBranchDialog
            repo={repo}
            base={`origin/${status.defaultBranch}`}
            branch={status.branch}
            open={compareDefaultOpen}
            onOpenChange={setCompareDefaultOpen}
          />
        )}
        {diverged && (
          <DivergedPullDialog
            repo={repo}
            branch={diverged.branch}
            upstream={diverged.upstream}
            open={!!diverged}
            onOpenChange={(o) => !o && setDiverged(null)}
            onChanged={() => refreshStatuses([repo.id])}
          />
        )}
        <DirtyPullDialog
          repo={repo}
          branch={status?.branch ?? null}
          upstream={status?.upstream ?? null}
          open={dirtyPull}
          onOpenChange={setDirtyPull}
          onChanged={() => refreshStatuses([repo.id])}
          onViewChanges={() => setDetailOpen(true)}
        />

        <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {repo.displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This only removes it from GitSplash's registry — the folder and your git history
                are untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>
                <Check className="size-4" /> Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={forcePushConfirm} onOpenChange={setForcePushConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Force push {status?.branch}?</AlertDialogTitle>
              <AlertDialogDescription>
                Overwrites the remote branch's history with your local branch. Uses
                "--force-with-lease" so it still fails safely if someone else pushed since your
                last fetch — but anything they pushed that you haven't fetched will still be lost
                once you re-run it after fetching.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <GitCommandPreview command="git push --force-with-lease" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => doPush(true)}>Force push</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}
