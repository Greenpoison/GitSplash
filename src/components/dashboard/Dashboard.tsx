import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { AddRepoDialog } from "@/components/repos/AddRepoDialog";
import { GroupManagerDialog } from "@/components/groups/GroupManagerDialog";
import { GroupSection } from "./GroupSection";
import { RepoCard } from "./RepoCard";

export function Dashboard() {
  const repos = useAppStore((s) => s.repos);
  const groups = useAppStore((s) => s.groups);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);

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
          <GroupManagerDialog />
          <AddRepoDialog />
        </div>
      </div>

      {repos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No repos tracked yet. Click "Add repo" to get started — nothing else on disk is ever
          scanned automatically.
        </p>
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
