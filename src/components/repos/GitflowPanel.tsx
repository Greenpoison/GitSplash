import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { GitBranch, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { BranchInfo, Repo } from "@/lib/types";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import { GITFLOW_DEFAULT_TARGETS, parseGitflowBranch } from "@/lib/gitflow";

export function GitflowPanel({
  repo,
  branches,
  onChanged,
}: {
  repo: Repo;
  branches: BranchInfo[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const current = branches.find((b) => b.isCurrent);
  const parsed = current ? parseGitflowBranch(current.name) : null;
  // A branch merely being *named* like a Gitflow branch (e.g. this
  // project's own "feature/V1.18" naming convention, unrelated to actual
  // Gitflow) shouldn't be enough to offer "finish" — only do that when at
  // least one of its real merge targets (develop/main) actually exists,
  // otherwise this repo clearly isn't using Gitflow and the prompt would
  // just be confusing noise.
  const existingTargets = parsed
    ? GITFLOW_DEFAULT_TARGETS[parsed.kind].filter((t) => branches.some((b) => b.name === t))
    : [];
  const finishing = parsed && existingTargets.length > 0 ? parsed : null;

  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);

  useEffect(() => {
    if (finishing) {
      setTargets(new Set(existingTargets));
      setTag("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name]);

  if (!finishing) return null;

  const finish = async () => {
    if (!finishing || targets.size === 0) return;
    if (deleteBranch) {
      setConfirmFinishOpen(true);
      return;
    }
    await doFinish();
  };

  const doFinish = async () => {
    if (!finishing || targets.size === 0) return;
    setConfirmFinishOpen(false);
    setBusy(true);
    try {
      const result = await api.finishGitflowBranch(
        repo.id,
        finishing.kind,
        finishing.branchName,
        Array.from(targets),
        finishing.kind === "feature" ? undefined : tag.trim() || undefined,
        deleteBranch,
      );
      if (result.success) {
        toast.success(`Finished ${current!.name}`, { description: result.completedSteps.join("; ") });
      } else {
        toast.warning(result.message ?? "Gitflow finish stopped with conflicts", {
          description: result.conflictedFiles.join(", "),
        });
      }
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gradient-border flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
      <p className="flex items-center gap-1.5 text-xs">
        <GitBranch className="size-3.5" /> Current branch is{" "}
        <span className="font-mono">{current!.name}</span> — finish it into:
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            <dl className="flex flex-col gap-1.5">
              <div>
                <dt className="font-semibold">Feature</dt>
                <dd>Branches off develop, merges back into develop.</dd>
              </div>
              <div>
                <dt className="font-semibold">Release</dt>
                <dd>Branches off develop, merges into main and develop. Usually tagged.</dd>
              </div>
              <div>
                <dt className="font-semibold">Hotfix</dt>
                <dd>Branches off main, merges into main and develop. Usually tagged.</dd>
              </div>
            </dl>
          </TooltipContent>
        </Tooltip>
      </p>
      <div className="flex flex-wrap gap-3">
        {GITFLOW_DEFAULT_TARGETS[finishing.kind].map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={targets.has(t)}
              onCheckedChange={(c) =>
                setTargets((prev) => {
                  const next = new Set(prev);
                  if (c) next.add(t);
                  else next.delete(t);
                  return next;
                })
              }
            />
            {t}
          </label>
        ))}
      </div>
      {finishing.kind !== "feature" && (
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder={`Tag (optional), e.g. v${finishing.branchName}`}
          className="h-7 text-xs"
        />
      )}
      <label className="flex items-center gap-1.5 text-xs">
        <Checkbox checked={deleteBranch} onCheckedChange={(c) => setDeleteBranch(!!c)} />
        Delete {current!.name} after merging
      </label>
      <Button size="sm" onClick={finish} disabled={busy || targets.size === 0} className="self-start">
        Finish {current!.name}
      </Button>

      <AlertDialog open={confirmFinishOpen} onOpenChange={setConfirmFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {current?.name} after merging?</AlertDialogTitle>
            <AlertDialogDescription>
              This finishes the gitflow branch by merging it into{" "}
              {Array.from(targets).join(", ")}, then permanently deletes{" "}
              <span className="font-mono">{current?.name}</span>. Uncheck "Delete after
              merging" first if you'd rather keep the branch around.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {current && (
            <GitCommandPreview
              command={[
                ...Array.from(targets).flatMap((t) => [
                  `git switch ${t}`,
                  `git merge --no-ff --no-edit ${current.name}`,
                ]),
                ...(finishing.kind !== "feature" && tag.trim() ? [`git tag ${tag.trim()}`] : []),
                `git branch -d ${current.name}`,
              ]}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doFinish}>Finish and delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
