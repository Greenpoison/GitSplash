import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import {
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Loader2,
  MessageSquare,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { PrCheck, PullRequestDetail, PullRequestSummary, Repo } from "@/lib/types";
import { FileTree } from "./FileTree";
import { DiffHunkView } from "./DiffHunkView";

const CHECK_ICON: Record<string, typeof CheckCircle2> = {
  SUCCESS: CheckCircle2,
  NEUTRAL: CheckCircle2,
  FAILURE: XCircle,
  ERROR: XCircle,
  CANCELLED: XCircle,
  TIMED_OUT: XCircle,
  ACTION_REQUIRED: XCircle,
};

function CheckStatusIcon({ check }: { check: PrCheck }) {
  if (!check.conclusion) return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  const Icon = CHECK_ICON[check.conclusion.toUpperCase()] ?? CheckCircle2;
  const isFailure = Icon === XCircle;
  return (
    <Icon
      className={cn("size-3.5 shrink-0", isFailure ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}
    />
  );
}

const REVIEW_STATE_LABEL: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "commented",
  DISMISSED: "dismissed review",
  PENDING: "pending",
};

export function PullRequestDetailDialog({
  repo,
  pr,
  open,
  onOpenChange,
}: {
  repo: Repo;
  pr: PullRequestSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [wrapDiff, setWrapDiff] = useState(false);

  useEffect(() => {
    if (!open || !pr) return;
    setDetail(null);
    setSelected(null);
    api
      .getPullRequestDetail(repo.id, pr.number)
      .then((d) => {
        setDetail(d);
        if (d.files.length > 0) setSelected(d.files[0].path);
      })
      .catch((e) => reportGitError(e));
  }, [open, pr, repo.id]);

  if (!pr) return null;
  const selectedFile = detail?.files.find((f) => f.path === selected) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:max-w-[95vw] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 leading-snug whitespace-normal break-words">
            <span className="min-w-0 flex-1 truncate">
              #{pr.number} {pr.title}
            </span>
            {detail?.reviewDecision && (
              <Badge
                variant="outline"
                className={cn(
                  detail.reviewDecision === "APPROVED" && "text-emerald-600 dark:text-emerald-400",
                  detail.reviewDecision === "CHANGES_REQUESTED" && "text-red-600 dark:text-red-400",
                )}
              >
                {REVIEW_STATE_LABEL[detail.reviewDecision] ?? detail.reviewDecision.toLowerCase()}
              </Badge>
            )}
            <Button size="icon-sm" variant="ghost" asChild>
              <a href={pr.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </DialogTitle>
          <DialogDescription>
            {pr.headRefName} → {pr.baseRefName}
          </DialogDescription>
        </DialogHeader>

        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="files">
                Files changed ({detail.files.length})
              </TabsTrigger>
              <TabsTrigger value="conversation">
                Conversation
                {(detail.checks.length > 0 || detail.reviews.length > 0 || detail.comments.length > 0) &&
                  ` (${detail.checks.length + detail.reviews.length + detail.comments.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="flex min-h-0 flex-1 gap-4">
              <div className="flex w-72 shrink-0 flex-col gap-2">
                {detail.files.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No file changes.</p>
                ) : (
                  <FileTree
                    files={detail.files.map((f) => f.path)}
                    query=""
                    selected={selected}
                    onSelect={setSelected}
                    renderBadge={(path) => {
                      const f = detail.files.find((x) => x.path === path);
                      if (!f) return null;
                      return (
                        <span className="font-mono text-[10px]">
                          <span className="text-emerald-600 dark:text-emerald-400">+{f.insertions}</span>{" "}
                          <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>
                        </span>
                      );
                    }}
                  />
                )}
              </div>

              <div className="flex flex-1 flex-col overflow-hidden">
                {!selectedFile ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Select a file to view its diff.
                  </div>
                ) : selectedFile.isBinary ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <FileWarning className="size-4" /> Binary file — can't preview the diff.
                  </div>
                ) : selectedFile.hunks.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No line changes (rename/mode change only).
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="flex flex-col gap-2 p-1">
                      <label className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
                        <Checkbox checked={wrapDiff} onCheckedChange={(c) => setWrapDiff(!!c)} className="size-3.5" />
                        Wrap long lines
                      </label>
                      {selectedFile.hunks.map((h, i) => (
                        <DiffHunkView key={i} hunk={h} staged={false} patchable={false} wrap={wrapDiff} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>

            <TabsContent value="conversation" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 p-1">
                  {detail.checks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Checks</span>
                      {detail.checks.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                          <CheckStatusIcon check={c} />
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          {c.detailsUrl && (
                            <Button size="icon-sm" variant="ghost" asChild>
                              <a href={c.detailsUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.reviews.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Reviews</span>
                      {detail.reviews.map((r, i) => (
                        <div key={i} className="flex flex-col gap-1 rounded-md border p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{r.author}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                r.state === "APPROVED" && "text-emerald-600 dark:text-emerald-400",
                                r.state === "CHANGES_REQUESTED" && "text-red-600 dark:text-red-400",
                              )}
                            >
                              {REVIEW_STATE_LABEL[r.state] ?? r.state.toLowerCase()}
                            </Badge>
                          </div>
                          {r.body && <p className="whitespace-pre-wrap text-muted-foreground">{r.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.comments.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <MessageSquare className="size-3" /> Comments
                      </span>
                      {detail.comments.map((c, i) => (
                        <div key={i} className="flex flex-col gap-1 rounded-md border p-2 text-sm">
                          <span className="font-medium">{c.author}</span>
                          <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.checks.length === 0 && detail.reviews.length === 0 && detail.comments.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">No checks, reviews, or comments yet.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
