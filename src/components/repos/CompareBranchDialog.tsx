import { useEffect, useMemo, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { FileWarning, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import * as api from "@/lib/api";
import type { CompareFile, FileDiff, Repo } from "@/lib/types";
import { DiffStatBadge } from "./DiffStatBadge";
import { FileTree } from "./FileTree";
import { DiffHunkView } from "./DiffHunkView";

export function CompareBranchDialog({
  repo,
  base,
  branch,
  open,
  onOpenChange,
}: {
  repo: Repo;
  base: string;
  branch: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [compareFiles, setCompareFiles] = useState<CompareFile[] | null>(null);
  const [branchFiles, setBranchFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [wrapDiff, setWrapDiff] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setDiff(null);
    setRawContent(null);
    setCompareFiles(null);
    Promise.all([api.compareBranches(repo.id, base, branch), api.listBranchFiles(repo.id, branch)])
      .then(([changes, files]) => {
        setCompareFiles(changes);
        setBranchFiles(files);
      })
      .catch((e) => reportGitError(e));
  }, [open, repo.id, base, branch]);

  const statusMap = useMemo(() => {
    const m = new Map<string, CompareFile>();
    for (const c of compareFiles ?? []) m.set(c.path, c);
    return m;
  }, [compareFiles]);

  const allFiles = useMemo(() => {
    const set = new Set(branchFiles);
    for (const c of compareFiles ?? []) set.add(c.path);
    return Array.from(set);
  }, [branchFiles, compareFiles]);

  const selectFile = async (path: string) => {
    setSelected(path);
    setDiff(null);
    setRawContent(null);
    setLoadingFile(true);
    try {
      if (statusMap.has(path)) {
        setDiff(await api.getCompareFileDiff(repo.id, base, branch, path));
      } else {
        setRawContent((await api.readBranchFile(repo.id, branch, path)) ?? "");
      }
    } catch (e) {
      reportGitError(e);
    } finally {
      setLoadingFile(false);
    }
  };

  const changedCount = compareFiles?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:max-w-[95vw] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            Compare <span className="font-mono">{branch}</span> against{" "}
            <span className="font-mono">{base}</span>
          </DialogTitle>
          <DialogDescription>
            {compareFiles === null
              ? "Loading…"
              : changedCount === 0
                ? `No differences from ${base}.`
                : `${changedCount} file${changedCount === 1 ? "" : "s"} differ from ${base}. Any file can be browsed — changed ones show a diff, the rest show their content on ${branch}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-72 shrink-0 flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter files…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <FileTree
              files={allFiles}
              query={query}
              selected={selected}
              onSelect={selectFile}
              renderBadge={(path) => {
                const c = statusMap.get(path);
                return c ? <DiffStatBadge file={c} /> : null;
              }}
            />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a file to compare.
              </div>
            ) : loadingFile ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : diff ? (
              diff.isBinary ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <FileWarning className="size-4" /> Binary file changed — can't preview the diff.
                </div>
              ) : diff.hunks.length === 0 ? (
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
                    {diff.hunks.map((h, i) => (
                      <DiffHunkView key={i} hunk={h} staged={false} patchable={false} wrap={wrapDiff} />
                    ))}
                  </div>
                </ScrollArea>
              )
            ) : (
              <ScrollArea className="gradient-border h-full rounded-md bg-card">
                <pre className="whitespace-pre p-2 font-mono text-xs">{rawContent}</pre>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
