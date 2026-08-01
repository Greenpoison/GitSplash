import { useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommandTooltip } from "@/components/GitCommandTooltip";
import * as api from "@/lib/api";
import type { CommitNode, Repo } from "@/lib/types";
import { CommitDetailDialog } from "./CommitDetailDialog";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/// Full-text search across the whole repo's history, not just one file —
/// FileHistoryPanel already covers "what happened to this file"; this covers
/// "which commit added this text" or "who touched this" without knowing
/// which file or commit to look at first. Message/author search runs as two
/// separate `git log` queries merged in Rust (see git/log.rs::search_commits)
/// since `--grep` and `--author` AND together rather than OR; content search
/// uses `git log -S` (pickaxe), a genuinely obscure but powerful feature most
/// git beginners have never heard of.
export function HistorySearchPanel({ repo }: { repo: Repo }) {
  const [query, setQuery] = useState("");
  const [searchContent, setSearchContent] = useState(false);
  const [results, setResults] = useState<CommitNode[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const commits = await api.searchCommits(repo.id, query.trim(), searchContent, 200);
      setResults(commits);
    } catch (e) {
      reportGitError(e);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={searchContent ? "Text added or removed in a commit…" : "Commit message or author…"}
              className="pl-7"
            />
          </div>
          <GitCommandTooltip
            label={searchContent ? "Search commits by diff content" : "Search commits by message/author"}
            command={
              searchContent
                ? `git log --all -S"${query || "<text>"}"`
                : `git log --all --grep="${query || "<text>"}"`
            }
          >
            <Button onClick={search} disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </GitCommandTooltip>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={searchContent} onCheckedChange={(c) => setSearchContent(!!c)} className="size-3.5" />
          Search code changes instead (find who added/removed this text)
        </label>
      </div>

      <ScrollArea className="gradient-border h-full min-h-0 flex-1 rounded-md bg-card">
        {results === null ? (
          <p className="p-3 text-sm text-muted-foreground">
            Search across every branch's history — by commit message, author name, or (with the
            checkbox above) by a snippet of code that was added or removed.
          </p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No matching commits found.</p>
        ) : (
          <div className="flex w-full min-w-0 flex-col divide-y">
            {results.map((c) => (
              <button
                key={c.hash}
                onClick={() => setSelectedCommit(c)}
                className="flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 dark:text-foreground/75"
              >
                <span className="min-w-0 truncate font-medium">{c.subject}</span>
                <span className="text-xs text-muted-foreground">
                  {c.author} · {formatDate(c.date)} · <span className="font-mono">{c.hash.slice(0, 7)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <CommitDetailDialog
        repo={repo}
        commit={selectedCommit}
        open={!!selectedCommit}
        onOpenChange={(o) => !o && setSelectedCommit(null)}
      />
    </div>
  );
}
