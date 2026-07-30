import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, Download, GitPullRequestArrow, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { BatchEvent, Group, Repo } from "@/lib/types";
import { RepoCard } from "./RepoCard";

const PHASE_ICON: Record<BatchEvent["phase"], typeof CheckCircle2> = {
  started: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
};

export function GroupSection({ group, repos }: { group: Group; repos: Repo[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<BatchEvent[]>([]);
  const refreshRepos = useAppStore((s) => s.refreshRepos);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);

  const runBatch = async (pull: boolean) => {
    if (repos.length === 0) return;
    setRunning(true);
    setLog([]);
    const repoIds = new Set(repos.map((r) => r.id));
    const unlisten = await listen<BatchEvent>("batch-progress", (event) => {
      if (!repoIds.has(event.payload.repoId)) return;
      setLog((prev) => [...prev, event.payload]);
    });
    try {
      await api.batchUpdateGroup(group.id, pull);
      await refreshRepos();
      await refreshStatuses(Array.from(repoIds));
      toast.success(`${pull ? "Fetch & pull" : "Fetch"} finished for ${group.name}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      unlisten();
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-sm font-semibold"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          {group.name}
          <span className="text-xs font-normal text-muted-foreground">({repos.length})</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={running} onClick={() => runBatch(false)}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Fetch
          </Button>
          <Button size="sm" disabled={running} onClick={() => runBatch(true)}>
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GitPullRequestArrow className="size-3.5" />
            )}
            Fetch &amp; pull
          </Button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="gradient-border flex flex-col gap-1 rounded-md bg-muted/30 p-2 text-xs">
          {log.map((e, i) => {
            const Icon = PHASE_ICON[e.phase];
            return (
              <div key={i} className="flex items-center gap-2">
                <Icon className={`size-3.5 ${e.phase === "started" ? "animate-spin" : ""}`} />
                <span className="font-medium">{e.repoName}</span>
                {e.message && <span className="text-muted-foreground">{e.message}</span>}
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && (
        <div className="flex flex-col gap-2">
          {repos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
          {repos.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">No repos in this group yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
