import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileWarning, Save, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { Repo } from "@/lib/types";

export function FileEditorPanel({ repo }: { repo: Repo }) {
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTrackedFiles(repo.id)
      .then(setFiles)
      .catch((e) => toast.error(String(e)));
  }, [repo.id]);

  const dirty = original !== null && content !== original;

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, query]);

  const load = async (path: string) => {
    setSelected(path);
    setLoading(true);
    try {
      const file = await api.readFileText(repo.id, path);
      setIsBinary(file.isBinary);
      setOriginal(file.isBinary ? null : file.content);
      setContent(file.isBinary ? "" : file.content);
    } catch (e) {
      toast.error(String(e));
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const selectFile = (path: string) => {
    if (path === selected) return;
    if (dirty) {
      setPendingFile(path);
      return;
    }
    load(path);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.writeFileText(repo.id, selected, content);
      setOriginal(content);
      toast.success(`Saved ${selected}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

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
                onClick={() => selectFile(f)}
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

      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to edit it.
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isBinary ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileWarning className="size-4" /> Binary file — can't be edited here.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{selected}</span>
              {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}
              <Button size="sm" onClick={save} disabled={!dirty || saving}>
                <Save className="size-3.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="h-full flex-1 resize-none font-mono text-xs"
            />
          </>
        )}
      </div>

      <AlertDialog open={!!pendingFile} onOpenChange={(o) => !o && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes to {selected}?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching files discards your edits — they were never saved to disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingFile!;
                setPendingFile(null);
                load(next);
              }}
            >
              Discard & switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
