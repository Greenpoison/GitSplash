import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { GitCompareArrows, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { BranchInfo, Repo } from "@/lib/types";
import { FileTree } from "./FileTree";

const MAX_BRANCHES = 3;

/// Unlike CompareBranchDialog (one base vs one branch, with a real two-way
/// diff), this picks up to three branches and shows each one's raw content
/// for a file side by side — there's no single "base" once you're comparing
/// three at once, so this trades diff highlighting for just letting you
/// eyeball all three versions at the same time. The file-tree dot still
/// flags files that differ from the first picked branch, computed from
/// pairwise `compare_branches` calls rather than any real three-way diff.
export function MultiBranchCompareDialog({
  repo,
  branches,
  open,
  onOpenChange,
}: {
  repo: Repo;
  branches: BranchInfo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [differing, setDiffering] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string | null> | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    if (!open) {
      setPicked([]);
      setSelected(null);
      setContents(null);
      setAllFiles([]);
      setDiffering(new Set());
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    setSelected(null);
    setContents(null);
    if (picked.length < 2) {
      setAllFiles([]);
      setDiffering(new Set());
      return;
    }
    setLoadingFiles(true);
    Promise.all(picked.map((b) => api.listBranchFiles(repo.id, b)))
      .then(async (lists) => {
        const union = new Set<string>();
        for (const list of lists) for (const f of list) union.add(f);
        setAllFiles(Array.from(union));

        const diffLists = await Promise.all(
          picked.slice(1).map((b) => api.compareBranches(repo.id, picked[0], b)),
        );
        const diffs = new Set<string>();
        for (const list of diffLists) for (const c of list) diffs.add(c.path);
        setDiffering(diffs);
      })
      .catch((e) => reportGitError(e))
      .finally(() => setLoadingFiles(false));
  }, [picked, repo.id]);

  const togglePick = (name: string) => {
    setPicked((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= MAX_BRANCHES) return prev;
      return [...prev, name];
    });
  };

  const selectFile = async (path: string) => {
    setSelected(path);
    setContents(null);
    setLoadingContent(true);
    try {
      const results = await Promise.all(picked.map((b) => api.readBranchFile(repo.id, b, path)));
      const next: Record<string, string | null> = {};
      picked.forEach((b, i) => {
        next[b] = results[i];
      });
      setContents(next);
    } catch (e) {
      reportGitError(e);
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:max-w-[95vw] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-4" /> Compare branches
          </DialogTitle>
          <DialogDescription>
            Pick up to {MAX_BRANCHES} branches to browse side by side, file by file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap gap-2 border-b pb-3">
          {branches.map((b) => {
            const checked = picked.includes(b.name);
            const disabled = !checked && picked.length >= MAX_BRANCHES;
            return (
              <label
                key={b.name}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
                  checked ? "border-primary/40 bg-primary/5" : "text-muted-foreground",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => togglePick(b.name)}
                  className="size-3.5"
                />
                {b.name}
              </label>
            );
          })}
        </div>

        {picked.length < 2 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Pick at least 2 branches to compare.
          </div>
        ) : (
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
              {loadingFiles ? (
                <p className="p-2 text-xs text-muted-foreground">Loading files…</p>
              ) : (
                <FileTree
                  files={allFiles}
                  query={query}
                  selected={selected}
                  onSelect={selectFile}
                  renderBadge={(path) =>
                    differing.has(path) ? (
                      <span
                        className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500"
                        title={`Differs from ${picked[0]}`}
                      />
                    ) : null
                  }
                />
              )}
            </div>

            <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
              {!selected ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select a file to compare.
                </div>
              ) : loadingContent ? (
                <p className="p-2 text-sm text-muted-foreground">Loading…</p>
              ) : (
                picked.map((b) => (
                  <div key={b} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border">
                    <div className="shrink-0 truncate border-b bg-muted/50 px-2 py-1 font-mono text-xs font-semibold">
                      {b}
                    </div>
                    <ScrollArea className="flex-1">
                      {contents?.[b] == null ? (
                        <p className="p-2 text-xs text-muted-foreground">Doesn't exist on this branch.</p>
                      ) : (
                        <pre className="whitespace-pre p-2 font-mono text-xs">{contents[b]}</pre>
                      )}
                    </ScrollArea>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
