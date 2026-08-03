import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportGitError } from "@/lib/gitErrors";
import * as api from "@/lib/api";
import type { BranchInfo, CommitNode, TagInfo } from "@/lib/types";
import { useAppStore } from "@/store/appStore";
import { CommitUniverse } from "./CommitUniverse";

// A bounded window rather than full history — the force layout is legible
// for a few hundred commits spread across branches, but would turn into an
// unreadable haze (and a slow layout pass) on a repo with years of history
// and no cap.
const COMMIT_LIMIT = 400;

export function RepoHistoryPage() {
  const repos = useAppStore((s) => s.repos);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);

  const selected = repos.find((r) => r.id === selectedId) ?? repos[0];

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getCommitGraph(selected.id, COMMIT_LIMIT),
      api.listBranches(selected.id),
      api.listTags(selected.id),
    ])
      .then(([c, b, t]) => {
        if (cancelled) return;
        setCommits(c);
        setBranches(b);
        setTags(t);
      })
      .catch((e) => !cancelled && reportGitError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Repo history</h1>
          <p className="text-sm text-muted-foreground">
            Every branch's commits, spread out and zoomable. Click a commit to see what it
            changed, then click a file to track it across the whole graph — hover a branch in the
            legend to spotlight it.
          </p>
        </div>
        {repos.length > 0 && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64 shrink-0">
              <SelectValue placeholder="Choose a repo…" />
            </SelectTrigger>
            <SelectContent>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No repos tracked yet — add one from the Dashboard first.
        </p>
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">Choose a repo above to explore its history.</p>
      ) : loading ? (
        <div className="flex min-h-[500px] flex-1 items-center justify-center rounded-lg border text-sm text-muted-foreground">
          Loading commit history…
        </div>
      ) : (
        <CommitUniverse repoId={selected.id} commits={commits} branches={branches} tags={tags} />
      )}
    </div>
  );
}
