import { useEffect } from "react";
import { ChevronDown, FolderGit2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/appStore";
import { AddRepoDialog } from "@/components/repos/AddRepoDialog";
import { CloneRepoDialog } from "@/components/repos/CloneRepoDialog";
import { GroupManagerDialog } from "@/components/groups/GroupManagerDialog";
import { GroupPromptDialog } from "@/components/groups/GroupPromptDialog";
import { GroupSection } from "./GroupSection";
import { RepoCard } from "./RepoCard";

export function Dashboard() {
  const repos = useAppStore((s) => s.repos);
  const groups = useAppStore((s) => s.groups);
  const accounts = useAppStore((s) => s.accounts);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const setAddRepoDialogOpen = useAppStore((s) => s.setAddRepoDialogOpen);
  const setCloneRepoDialogOpen = useAppStore((s) => s.setCloneRepoDialogOpen);
  const setGroupManagerOpen = useAppStore((s) => s.setGroupManagerOpen);
  const setCreateAccountDialogOpen = useAppStore((s) => s.setCreateAccountDialogOpen);

  useEffect(() => {
    const interval = setInterval(() => refreshStatuses(), 60_000);
    return () => clearInterval(interval);
  }, [refreshStatuses]);

  const ungrouped = repos.filter((r) => r.groupIds.length === 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setGroupManagerOpen(true)}>
            Manage groups
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                Add repo <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAddRepoDialogOpen(true)}>
                <FolderOpen className="size-4" /> Add existing folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCloneRepoDialogOpen(true)}>
                <FolderGit2 className="size-4" /> Clone from URL
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <GroupManagerDialog />
          <AddRepoDialog />
          <CloneRepoDialog />
          <GroupPromptDialog />
        </div>
      </div>

      {accounts.length === 0 && repos.length === 0 ? (
        <div className="gradient-border flex flex-col items-start gap-3 rounded-lg bg-card p-6">
          <div>
            <h2 className="text-base font-semibold">Welcome to GitSplash</h2>
            <p className="mt-1 text-sm text-foreground/80">
              Start by adding a GitHub account — GitSplash generates an SSH identity for it and
              routes every repo you assign to it through that identity automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => setCreateAccountDialogOpen(true)}>
              Add a GitHub account
            </Button>
            <button
              type="button"
              className="text-xs text-foreground/70 underline"
              onClick={() => setAddRepoDialogOpen(true)}
            >
              or just add a repo directly
            </button>
          </div>
        </div>
      ) : (
        repos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No repos tracked yet. Click "Add repo" to get started — nothing else on disk is ever
            scanned automatically.
          </p>
        )
      )}

      {groups.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          repos={repos.filter((r) => r.groupIds.includes(group.id))}
        />
      ))}

      {ungrouped.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Ungrouped</h2>
          <div className="flex flex-col gap-2">
            {ungrouped.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
