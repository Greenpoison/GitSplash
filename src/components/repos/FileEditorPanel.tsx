import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { FileWarning, Save, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import * as api from "@/lib/api";
import type { Repo } from "@/lib/types";
import { FileTree } from "./FileTree";

export function FileEditorPanel({
  repo,
  onDirtyChange,
}: {
  repo: Repo;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [modifiedAt, setModifiedAt] = useState<number | null>(null);

  useEffect(() => {
    api
      .listTrackedFiles(repo.id)
      .then(setFiles)
      .catch((e) => reportGitError(e));
  }, [repo.id]);

  const dirty = original !== null && content !== original;

  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const load = async (path: string) => {
    setSelected(path);
    setLoading(true);
    try {
      const file = await api.readFileText(repo.id, path);
      setIsBinary(file.isBinary);
      setOriginal(file.isBinary ? null : file.content);
      setContent(file.isBinary ? "" : file.content);
      setModifiedAt(file.modifiedAt);
    } catch (e) {
      reportGitError(e);
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
      const newModifiedAt = await api.writeFileText(repo.id, selected, content, modifiedAt);
      setOriginal(content);
      setModifiedAt(newModifiedAt);
      toast.success(`Saved ${selected}`);
    } catch (e) {
      reportGitError(e);
    } finally {
      setSaving(false);
    }
  };

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
        <FileTree files={files} query={query} selected={selected} onSelect={selectFile} />
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
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{selected}</span>
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
