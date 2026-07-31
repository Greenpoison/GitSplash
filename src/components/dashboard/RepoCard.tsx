import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  GitPullRequestArrow,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

export function RepoCard({ repo }: { repo: Repo }) {
  const status = useAppStore((s) => s.statuses[repo.id]);
  const accounts = useAppStore((s) => s.accounts);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const [editGroupsOpen, setEditGroupsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [diverged, setDiverged] = useState<{ branch: string; upstream: string } | null>(null);

  const account = accounts.find((a) => a.id === repo.accountId);

  const doFetch = async (pull: boolean) => {
    setFetching(true);
    try {
      const outcome = await api.fetchRepo(repo.id, pull);
      if (!outcome.fetched) {
        toast.error(outcome.message ?? "Fetch failed");
      } else if (outcome.diverged && outcome.upstream && status?.branch) {
        setDiverged({ branch: status.branch, upstream: outcome.upstream });
      } else if (pull && !outcome.pulled) {
        toast.warning(outcome.message ?? "Fetched, but didn't pull", { description: repo.displayName });
      } else {
        toast.success(`${pull ? "Fetch & pull" : "Fetch"} finished for ${repo.displayName}`);
      }
      await Promise.all([refreshRepos(), refreshStatuses([repo.id])]);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setFetching(false);
    }
  };

  const assign = async (accountId: string | null) => {
    try {
      await api.assignRepoAccount(repo.id, accountId);
      await refreshRepos();
      toast.success(accountId ? "Account assigned" : "Account cleared");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const remove = async () => {
    try {
      await api.removeRepo(repo.id);
      await refreshRepos();
      toast.success(`Removed ${repo.displayName} from GitSplash (files untouched)`);
    } catch (e) {
      toast.error(String(e));
    }
  };

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

      <Button
        variant="ghost"
        size="icon"
        disabled={fetching}
        onClick={(e) => {
          e.stopPropagation();
          doFetch(false);
        }}
        title="Fetch"
      >
        {fetching ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        disabled={fetching}
        onClick={(e) => {
          e.stopPropagation();
          doFetch(true);
        }}
        title="Fetch & pull"
      >
        {fetching ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequestArrow className="size-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          api.openRepoExternal(repo.id).catch((err) => toast.error(String(err)));
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
        <RepoDetailDialog repo={repo} open={detailOpen} onOpenChange={setDetailOpen} />
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
      </div>
    </Card>
  );
}
