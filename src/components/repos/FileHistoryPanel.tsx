import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { History, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { BlameLine, CommitNode, Repo } from "@/lib/types";
import { colorForAge } from "@/lib/blameHeatmap";
import { CommitDetailDialog } from "./CommitDetailDialog";
import { FileTree } from "./FileTree";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const LINE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function colorForHash(hash: string): string {
  let sum = 0;
  for (const c of hash) sum += c.charCodeAt(0);
  return LINE_COLORS[sum % LINE_COLORS.length];
}

function HistoryList({ repo, path }: { repo: Repo; path: string }) {
  const [commits, setCommits] = useState<CommitNode[] | null>(null);
  const [wrapText, setWrapText] = useState(true);
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);

  useEffect(() => {
    setCommits(null);
    api
      .getFileHistory(repo.id, path, 100)
      .then(setCommits)
      .catch((e) => reportGitError(e));
  }, [repo.id, path]);

  if (!commits) return <p className="p-2 text-sm text-muted-foreground">Loading…</p>;
  if (commits.length === 0) return <p className="p-2 text-sm text-muted-foreground">No history found.</p>;

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="flex items-center justify-end gap-1.5 border-b px-2 py-1.5">
        <Checkbox
          id="file-history-wrap"
          checked={wrapText}
          onCheckedChange={(c) => setWrapText(!!c)}
          className="size-3.5"
        />
        <Label htmlFor="file-history-wrap" className="text-xs font-normal text-muted-foreground">
          Wrap text
        </Label>
      </div>
      <div className="flex w-full min-w-0 flex-col divide-y">
        {commits.map((c) => (
          <button
            key={c.hash}
            onClick={() => setSelectedCommit(c)}
            title="Explore this commit"
            className="flex w-full min-w-0 flex-col gap-0.5 px-2 py-2 text-left text-sm text-foreground hover:bg-accent/50 dark:text-foreground/75"
          >
            <span className={cn("min-w-0 font-medium", wrapText ? "whitespace-normal break-words" : "truncate")}>
              {c.subject}
            </span>
            <span className="text-xs text-muted-foreground">
              {c.author} · {formatDate(c.date)} · <span className="font-mono">{c.hash.slice(0, 7)}</span>
            </span>
          </button>
        ))}
      </div>

      <CommitDetailDialog
        repo={repo}
        commit={selectedCommit}
        open={!!selectedCommit}
        onOpenChange={(o) => !o && setSelectedCommit(null)}
      />
    </div>
  );
}

function BlameView({ repoId, path }: { repoId: string; path: string }) {
  const [lines, setLines] = useState<BlameLine[] | null>(null);
  const [heatmap, setHeatmap] = useState(true);

  useEffect(() => {
    setLines(null);
    api
      .getBlame(repoId, path)
      .then(setLines)
      .catch((e) => reportGitError(e));
  }, [repoId, path]);

  if (!lines) return <p className="p-2 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-1.5 border-b px-2 py-1.5">
        <Checkbox
          id="blame-heatmap"
          checked={heatmap}
          onCheckedChange={(c) => setHeatmap(!!c)}
          className="size-3.5"
        />
        <Label htmlFor="blame-heatmap" className="text-xs font-normal text-muted-foreground">
          Color by age (newest = warmest)
        </Label>
      </div>
      <div className="font-mono text-xs">
        {lines.map((l) => (
          <div key={l.lineNumber} className="flex gap-2 px-2 hover:bg-accent/50" title={l.summary}>
            <span
              className="w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: heatmap ? colorForAge(l.authorTime) : colorForHash(l.commitHash) }}
            />
            <span className="w-16 shrink-0 truncate text-muted-foreground">{l.author}</span>
            <span className="w-8 shrink-0 text-right text-muted-foreground">{l.lineNumber}</span>
            <span className="whitespace-pre">{l.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FileHistoryPanel({ repo }: { repo: Repo }) {
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTrackedFiles(repo.id)
      .then(setFiles)
      .catch((e) => reportGitError(e));
  }, [repo.id]);

  return (
    <div className="flex h-[70vh] gap-4">
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
        <FileTree files={files} query={query} selected={selected} onSelect={setSelected} />
      </div>

      <div className="flex-1 overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <History className="mr-2 size-4" /> Select a file to see its history and blame.
          </div>
        ) : (
          <Tabs defaultValue="history" className="flex h-full flex-col">
            <TabsList>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="blame">Blame</TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="flex-1 overflow-hidden">
              <ScrollArea className="gradient-border h-full rounded-md bg-card">
                <HistoryList repo={repo} path={selected} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="blame" className="flex-1 overflow-hidden">
              <ScrollArea className="gradient-border h-full rounded-md bg-card">
                <BlameView repoId={repo.id} path={selected} />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
