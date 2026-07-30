import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, GitPullRequest, Plus } from "lucide-react";
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
import * as api from "@/lib/api";
import type { BranchInfo, PullRequestSummary, Repo } from "@/lib/types";

export function PullRequestsPanel({ repo }: { repo: Repo }) {
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);

  const load = async () => {
    setLoading(true);
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
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const create = async () => {
    if (!title.trim() || !base) {
      toast.error("Title and base branch are required");
      return;
    }
    try {
      const url = await api.createPullRequest(repo.id, title.trim(), body, base, draft);
      toast.success("Pull request created", { description: url });
      setTitle("");
      setBody("");
      setShowCreate(false);
      await load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const merge = async (number: number, method: "merge" | "squash" | "rebase") => {
    try {
      await api.mergePullRequest(repo.id, number, method);
      toast.success(`PR #${number} merged (${method})`);
      await load();
    } catch (e) {
      toast.error(String(e));
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${prs.length} open pull request${prs.length === 1 ? "" : "s"}`}
        </span>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" /> New PR
        </Button>
      </div>

      {showCreate && (
        <div className="gradient-border flex flex-col gap-3 rounded-md bg-card p-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
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
          <Button onClick={create} size="sm">
            Create pull request
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {prs.map((pr) => (
          <div key={pr.number} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <GitPullRequest className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate">
              #{pr.number} {pr.title}
            </span>
            {pr.isDraft && <Badge variant="outline">draft</Badge>}
            <Badge variant="secondary">
              {pr.headRefName} → {pr.baseRefName}
            </Badge>
            <Button size="icon" variant="ghost" className="size-7" asChild>
              <a href={pr.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Select onValueChange={(m) => merge(pr.number, m as "merge" | "squash" | "rebase")}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="Merge…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">Merge</SelectItem>
                <SelectItem value="squash">Squash</SelectItem>
                <SelectItem value="rebase">Rebase</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
        {!loading && prs.length === 0 && (
          <p className="text-sm text-muted-foreground">No open pull requests.</p>
        )}
      </div>
    </div>
  );
}
