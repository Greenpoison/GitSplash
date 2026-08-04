import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError, translateGitError } from "@/lib/gitErrors";
import { ExternalLink, GitPullRequest, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { BranchInfo, PrTemplate, PullRequestSummary, Repo } from "@/lib/types";
import { GitCommandPreview } from "@/components/GitCommandPreview";
import { GitCommandTooltip } from "@/components/GitCommandTooltip";
import { PullRequestDetailDialog } from "./PullRequestDetailDialog";

export function PullRequestsPanel({ repo }: { repo: Repo }) {
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ pr: PullRequestSummary; method: "merge" | "squash" | "rebase" } | null>(null);
  const [detailPr, setDetailPr] = useState<PullRequestSummary | null>(null);
  const [templates, setTemplates] = useState<PrTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");

  // Detects the repo's own PR template(s) on disk (no AI involved — this
  // only ever surfaces the literal file(s) the repo's maintainers wrote)
  // and pre-fills the description so the user fills in the existing
  // format instead of starting from a blank box or having to remember it.
  useEffect(() => {
    if (!showCreate) return;
    api
      .getPullRequestTemplates(repo.id)
      .then((found) => {
        setTemplates(found);
        if (found.length > 0 && !body.trim()) {
          setBody(found[0].content);
          setTemplateName(found[0].name);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, repo.id]);

  const applyTemplate = (name: string) => {
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    setTemplateName(name);
    setBody(t.content);
  };

  const load = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const available = await api.isGhAvailable();
      setGhAvailable(available);
      if (!available) return;
      const [prList, branchList] = await Promise.all([
        api.listPullRequests(repo.id),
        api.listBranches(repo.id),
      ]);
      setPrs(prList);
      setBranches(branchList);
    } catch (e) {
      // gh being installed doesn't mean this repo's account is actually
      // authenticated — surface that distinctly so an empty list doesn't
      // read as "no PRs" when it's really "auth is broken."
      setAuthError(String(e));
      setPrs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const current = branches.find((b) => b.isCurrent);
  const needsPush = !!current && !current.upstream;

  const pushAndOpenCreate = async () => {
    if (!current) return;
    setPushing(true);
    try {
      const outcome = await api.pushRepo(repo.id, false, crypto.randomUUID());
      if (!outcome.pushed) {
        if (outcome.rejected) {
          toast.error("Push rejected — the remote has commits you don't have yet", {
            description: "Fetch & pull first, then try again.",
          });
        } else {
          const { message, hint } = translateGitError(outcome.message ?? "Push failed");
          toast.error(message, hint ? { description: hint } : undefined);
        }
        return;
      }
      toast.success("Branch published");
      const defaultBase = branches.find((b) => !b.isCurrent && (b.name === "main" || b.name === "master"));
      if (defaultBase && !base) setBase(defaultBase.name);
      setShowCreate(true);
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setPushing(false);
    }
  };

  const create = async () => {
    if (!title.trim() || !base) {
      toast.error("Title and base branch are required");
      return;
    }
    setCreating(true);
    try {
      const url = await api.createPullRequest(repo.id, title.trim(), body, base, draft);
      toast.success("Pull request created", { description: url });
      setTitle("");
      setBody("");
      setTemplateName("");
      setTemplates([]);
      setShowCreate(false);
      await load();
    } catch (e) {
      reportGitError(e);
    } finally {
      setCreating(false);
    }
  };

  const merge = async () => {
    if (!mergeTarget) return;
    const { pr, method } = mergeTarget;
    setMergeTarget(null);
    try {
      await api.mergePullRequest(repo.id, pr.number, method);
      toast.success(`PR #${pr.number} merged (${method})`);
      await load();
    } catch (e) {
      reportGitError(e);
    }
  };

  if (ghAvailable === false) {
    return (
      <p className="text-sm text-muted-foreground">
        GitHub CLI (gh) isn't available. Install it and run `gh auth login` for this repo's
        account to manage pull requests here.
      </p>
    );
  }

  if (authError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't reach GitHub for this repo's account — run `gh auth login` (or check you're
        logged into the right account) and try again.
        <span className="mt-1 block text-xs">{authError}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${prs.length} open pull request${prs.length === 1 ? "" : "s"}`}
        </span>
        {needsPush ? (
          <GitCommandTooltip
            label="Push, then open the New PR form"
            command={`git push -u origin ${current?.name}`}
          >
            <Button size="sm" onClick={pushAndOpenCreate} disabled={pushing}>
              <Upload className="size-3.5" /> {pushing ? "Pushing…" : "Push & New PR"}
            </Button>
          </GitCommandTooltip>
        ) : (
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-3.5" /> New PR
          </Button>
        )}
      </div>

      {showCreate && (
        <div className="gradient-border flex flex-col gap-3 rounded-md bg-card p-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {templates.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Template</Label>
              <Select value={templateName} onValueChange={applyTemplate}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              Description
              {templates.length === 1 && (
                <span className="text-xs font-normal text-muted-foreground">
                  (pre-filled from this repo's PR template — fill it in below)
                </span>
              )}
            </Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={templates.length > 0 ? 8 : 3} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Base branch</Label>
              <Select value={base} onValueChange={setBase}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select base" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox id="draft-pr" checked={draft} onCheckedChange={(c) => setDraft(!!c)} />
              <Label htmlFor="draft-pr" className="font-normal">
                Draft
              </Label>
            </div>
          </div>
          <Button onClick={create} size="sm" disabled={creating}>
            {creating ? "Creating…" : "Create pull request"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {prs.map((pr) => (
          <div
            key={pr.number}
            className="flex cursor-pointer flex-col gap-1.5 rounded-md border p-2 text-sm hover:bg-accent/50"
            onClick={() => setDetailPr(pr)}
          >
            <div className="flex items-center gap-2">
              <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                #{pr.number} {pr.title}
              </span>
              {pr.isDraft && <Badge variant="outline">draft</Badge>}
              <Button size="icon" variant="ghost" className="size-7" asChild onClick={(e) => e.stopPropagation()}>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
              <Select
                onValueChange={(m) => setMergeTarget({ pr, method: m as "merge" | "squash" | "rebase" })}
              >
                <SelectTrigger className="h-7 w-28 text-xs" onClick={(e) => e.stopPropagation()}>
                  <SelectValue placeholder="Merge…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge</SelectItem>
                  <SelectItem value="squash">Squash</SelectItem>
                  <SelectItem value="rebase">Rebase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Its own row, not squeezed onto the title's — a long branch
                name (dependabot/codex branches routinely run 40+ chars)
                would otherwise claim most of the row's width and truncate
                the actual PR title down to almost nothing. */}
            <Badge variant="secondary" className="ml-6 w-fit max-w-full truncate">
              {pr.headRefName} → {pr.baseRefName}
            </Badge>
          </div>
        ))}
        {!loading && prs.length === 0 && (
          <p className="text-sm text-muted-foreground">No open pull requests.</p>
        )}
      </div>

      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mergeTarget?.method === "merge" ? "Merge" : mergeTarget?.method === "squash" ? "Squash and merge" : "Rebase and merge"}{" "}
              PR #{mergeTarget?.pr.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              "{mergeTarget?.pr.title}" will be merged into {mergeTarget?.pr.baseRefName} on
              GitHub right away — this can't be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mergeTarget && (
            <GitCommandPreview command={`gh pr merge ${mergeTarget.pr.number} --${mergeTarget.method}`} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={merge}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PullRequestDetailDialog
        repo={repo}
        pr={detailPr}
        open={!!detailPr}
        onOpenChange={(o) => !o && setDetailPr(null)}
      />
    </div>
  );
}
