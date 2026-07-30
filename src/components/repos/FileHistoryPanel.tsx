import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { BlameLine, CommitNode, Repo } from "@/lib/types";

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

function HistoryList({ repoId, path }: { repoId: string; path: string }) {
  const [commits, setCommits] = useState<CommitNode[] | null>(null);

  useEffect(() => {
    setCommits(null);
    api
      .getFileHistory(repoId, path, 100)
      .then(setCommits)
      .catch((e) => toast.error(String(e)));
  }, [repoId, path]);

  if (!commits) return <p className="p-2 text-sm text-muted-foreground">Loading…</p>;
  if (commits.length === 0) return <p className="p-2 text-sm text-muted-foreground">No history found.</p>;

  return (
    <div className="flex flex-col divide-y">
      {commits.map((c) => (
        <div key={c.hash} className="flex flex-col gap-0.5 px-2 py-2 text-sm">
          <span className="font-medium">{c.subject}</span>
          <span className="text-xs text-muted-foreground">
            {c.author} · {formatDate(c.date)} · <span className="font-mono">{c.hash.slice(0, 7)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function BlameView({ repoId, path }: { repoId: string; path: string }) {
  const [lines, setLines] = useState<BlameLine[] | null>(null);

  useEffect(() => {
    setLines(null);
    api
      .getBlame(repoId, path)
      .then(setLines)
      .catch((e) => toast.error(String(e)));
  }, [repoId, path]);

  if (!lines) return <p className="p-2 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="font-mono text-xs">
      {lines.map((l) => (
        <div key={l.lineNumber} className="flex gap-2 px-2 hover:bg-accent/50" title={l.summary}>
          <span
            className="w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: colorForHash(l.commitHash) }}
          />
          <span className="w-16 shrink-0 truncate text-muted-foreground">{l.author}</span>
          <span className="w-8 shrink-0 text-right text-muted-foreground">{l.lineNumber}</span>
          <span className="whitespace-pre">{l.content}</span>
        </div>
      ))}
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
      .catch((e) => toast.error(String(e)));
  }, [repo.id]);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, query]);

  return (
    <div className="flex h-[480px] gap-4">
      <div className="flex w-64 shrink-0 flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <ScrollArea className="flex-1 rounded-md border">
          <div className="flex flex-col p-1">
            {filtered.map((f) => (
              <button
                key={f}
                onClick={() => setSelected(f)}
                className={cn(
                  "truncate rounded-md px-2 py-1 text-left font-mono text-xs",
                  selected === f ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {f}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No files match.</p>
            )}
          </div>
        </ScrollArea>
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
              <ScrollArea className="h-full rounded-md border">
                <HistoryList repoId={repo.id} path={selected} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="blame" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full rounded-md border">
                <BlameView repoId={repo.id} path={selected} />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
