import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GitBranch, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import type { BranchInfo, GitflowKind, Repo } from "@/lib/types";

const DEFAULT_BASE: Record<GitflowKind, string> = {
  feature: "develop",
  release: "develop",
  hotfix: "main",
};

const DEFAULT_TARGETS: Record<GitflowKind, string[]> = {
  feature: ["develop"],
  release: ["main", "develop"],
  hotfix: ["main", "develop"],
};

function parseGitflowBranch(name: string): { kind: GitflowKind; branchName: string } | null {
  const match = /^(feature|release|hotfix)\/(.+)$/.exec(name);
  if (!match) return null;
  return { kind: match[1] as GitflowKind, branchName: match[2] };
}

export function GitflowPanel({
  repo,
  branches,
  onChanged,
}: {
  repo: Repo;
  branches: BranchInfo[];
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<GitflowKind>("feature");
  const [name, setName] = useState("");
  const [baseBranch, setBaseBranch] = useState(DEFAULT_BASE.feature);
  const [busy, setBusy] = useState(false);

  const current = branches.find((b) => b.isCurrent);
  const finishing = current ? parseGitflowBranch(current.name) : null;

  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);

  useEffect(() => {
    if (finishing) {
      setTargets(new Set(DEFAULT_TARGETS[finishing.kind]));
      setTag("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name]);

  const start = async () => {
    if (!name.trim()) {
      toast.error("Enter a name for the new branch");
      return;
    }
    setBusy(true);
    try {
      await api.startGitflowBranch(repo.id, kind, name.trim(), baseBranch.trim() || DEFAULT_BASE[kind]);
      toast.success(`Started ${kind}/${name.trim()}`);
      setName("");
      onChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

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
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gradient-border flex flex-col gap-3 rounded-md bg-card p-3">
      <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <GitBranch className="size-3.5" /> Gitflow
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            feature: branches off develop, merges back to develop. release: branches off develop,
            merges to main and develop, usually tagged. hotfix: branches off main, merges to main
            and develop, usually tagged.
          </TooltipContent>
        </Tooltip>
      </Label>

      {finishing && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="text-xs">
            Current branch is <span className="font-mono">{current!.name}</span> — finish it into:
          </p>
          <div className="flex flex-wrap gap-3">
            {DEFAULT_TARGETS[finishing.kind].map((t) => (
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
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doFinish}>Finish and delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={kind}
            onValueChange={(v) => {
              const k = v as GitflowKind;
              setKind(k);
              setBaseBranch(DEFAULT_BASE[k]);
            }}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feature">feature</SelectItem>
              <SelectItem value="release">release</SelectItem>
              <SelectItem value="hotfix">hotfix</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-feature"
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Base branch</Label>
          <Input
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className="h-8 w-32 text-xs"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={start} disabled={busy || !name.trim()}>
              {name.trim() ? `Start ${kind}/${name.trim()}` : `Start ${kind}`}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {name.trim()
              ? `Creates ${kind}/${name.trim()} off ${baseBranch.trim() || DEFAULT_BASE[kind]} and checks it out`
              : `Enter a name above to start a new ${kind} branch`}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
