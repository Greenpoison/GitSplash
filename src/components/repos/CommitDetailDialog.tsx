import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { FileWarning } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { CommitNode, CompareFile, FileDiff, Repo } from "@/lib/types";
import { COMPARE_STATUS_DOT, COMPARE_STATUS_LABEL } from "@/lib/compareFileStatus";
import { FileTree } from "./FileTree";
import { DiffHunkView } from "./DiffHunkView";

export function CommitDetailDialog({
  repo,
  commit,
  open,
  onOpenChange,
}: {
  repo: Repo;
  commit: CommitNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [files, setFiles] = useState<CompareFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [wrapDiff, setWrapDiff] = useState(false);

  useEffect(() => {
    if (!open || !commit) return;
    setSelected(null);
    setDiff(null);
    setFiles(null);
    api
      .getCommitFiles(repo.id, commit.hash)
      .then(setFiles)
      .catch((e) => reportGitError(e));
  }, [open, commit, repo.id]);

  const selectFile = async (path: string) => {
    if (!commit) return;
    setSelected(path);
    setDiff(null);
    setLoadingFile(true);
    try {
      setDiff(await api.getCommitFileDiff(repo.id, commit.hash, path));
    } catch (e) {
      reportGitError(e);
    } finally {
      setLoadingFile(false);
    }
  };

  if (!commit) return null;
  const statusMap = new Map((files ?? []).map((f) => [f.path, f]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:max-w-[95vw] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="leading-snug whitespace-normal break-words">{commit.subject}</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <span className="font-mono">{commit.hash.slice(0, 7)}</span>
            <CopyButton value={commit.hash} label="Copy full commit hash" />
            <span>· {commit.author} · {new Date(commit.date).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-72 shrink-0 flex-col gap-2">
            {files === null ? (
              <p className="p-2 text-xs text-muted-foreground">Loading…</p>
            ) : files.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No file changes.</p>
            ) : (
              <FileTree
                files={files.map((f) => f.path)}
                query=""
                selected={selected}
                onSelect={selectFile}
                renderBadge={(path) => {
                  const f = statusMap.get(path);
                  if (!f) return null;
                  return (
                    <span
                      className={cn("ml-auto size-1.5 shrink-0 rounded-full", COMPARE_STATUS_DOT[f.status])}
                      title={COMPARE_STATUS_LABEL[f.status]}
                    />
                  );
                }}
              />
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a file to view its diff.
              </div>
            ) : loadingFile ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : diff?.isBinary ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileWarning className="size-4" /> Binary file — can't preview the diff.
              </div>
            ) : diff && diff.hunks.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No line changes (rename/mode change only).
              </div>
            ) : diff ? (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-2 p-1">
                  <label className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
                    <Checkbox checked={wrapDiff} onCheckedChange={(c) => setWrapDiff(!!c)} className="size-3.5" />
                    Wrap long lines
                  </label>
                  {diff.hunks.map((h, i) => (
                    <DiffHunkView key={i} hunk={h} staged={false} patchable={false} wrap={wrapDiff} />
                  ))}
                </div>
              </ScrollArea>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
