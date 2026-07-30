import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import type { BranchInfo, CommitNode, Repo } from "@/lib/types";
import { CommitGraph } from "./CommitGraph";

export function BranchesPanel({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [b, c] = await Promise.all([
        api.listBranches(repo.id),
        api.getCommitGraph(repo.id, 60),
      ]);
      setBranches(b);
      setCommits(c);
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const checkout = async (branch: string) => {
    setBusy(true);
    try {
      await api.checkoutBranch(repo.id, branch);
      toast.success(`Switched to ${branch}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    setBusy(true);
    try {
      const branch = await api.checkoutPreviousBranch(repo.id);
      toast.success(`Switched back to ${branch}`);
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

  const current = branches.find((b) => b.isCurrent);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Button
            key={b.name}
            size="sm"
            variant={b.isCurrent ? "default" : "outline"}
            disabled={busy || b.isCurrent}
            onClick={() => checkout(b.name)}
          >
            {b.name}
            {b.upstream && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {b.upstream}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={back} disabled={busy}>
          <ArrowLeft className="size-3.5" /> Back to previous branch
        </Button>
        <Select value={mergeTarget} onValueChange={setMergeTarget}>
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
        <Button size="sm" onClick={merge} disabled={busy || !mergeTarget}>
          <GitMerge className="size-3.5" />
          Merge into {current?.name ?? "current"}
        </Button>
      </div>

      <CommitGraph commits={commits} />
    </div>
  );
}
