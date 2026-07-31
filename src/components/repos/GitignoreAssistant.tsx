import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { FileWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { GitCommandPreview } from "@/components/GitCommandPreview";
import * as api from "@/lib/api";
import type { FileChange, Repo } from "@/lib/types";
import { detectGitignoreSuggestions, type GitignoreSuggestion } from "@/lib/gitignoreSuggestions";

/// Appends `pattern` to .gitignore, creating the file if it doesn't exist
/// yet and leaving any existing content untouched otherwise.
async function appendToGitignore(repoId: string, pattern: string) {
  let existing = "";
  let modifiedAt: number | null = null;
  try {
    const file = await api.readFileText(repoId, ".gitignore");
    if (!file.isBinary) existing = file.content;
    modifiedAt = file.modifiedAt;
  } catch {
    // No .gitignore yet — start fresh.
  }
  if (existing.split(/\r?\n/).includes(pattern)) return;
  const trimmed = existing.replace(/\s+$/, "");
  const content = trimmed.length > 0 ? `${trimmed}\n${pattern}\n` : `${pattern}\n`;
  await api.writeFileText(repoId, ".gitignore", content, modifiedAt);
}

/// A dismissible banner that flags common categories of files that almost
/// never belong in git (dependencies, build output, secrets) — the classic
/// beginner mistake of committing node_modules/ or a .env file with real
/// credentials in it. Offers to add a .gitignore entry, and to untrack
/// anything already committed.
export function GitignoreAssistant({
  repo,
  changedFiles,
  onChanged,
}: {
  repo: Repo;
  changedFiles: FileChange[];
  onChanged: () => void;
}) {
  const [trackedPaths, setTrackedPaths] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<GitignoreSuggestion | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIgnored(new Set());
    api
      .listTrackedFiles(repo.id)
      .then(setTrackedPaths)
      .catch(() => setTrackedPaths([]));
  }, [repo.id]);

  const untrackedPaths = changedFiles.filter((f) => f.isUntracked).map((f) => f.path);
  const suggestions = detectGitignoreSuggestions(trackedPaths, untrackedPaths, ignored);

  const apply = async (s: GitignoreSuggestion) => {
    setBusy(true);
    try {
      await appendToGitignore(repo.id, s.pattern);
      if (s.trackedPaths.length > 0) {
        await api.untrackPaths(repo.id, s.trackedPaths);
      }
      toast.success(
        s.trackedPaths.length > 0
          ? `Added ${s.pattern} to .gitignore and untracked ${s.trackedPaths.length} file${s.trackedPaths.length === 1 ? "" : "s"} — commit to make it stick`
          : `Added ${s.pattern} to .gitignore`,
      );
      setConfirmTarget(null);
      setIgnored((prev) => new Set(prev).add(s.pattern));
      onChanged();
    } catch (e) {
      reportGitError(e);
    } finally {
      setBusy(false);
    }
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {suggestions.map((s) => (
        <div
          key={s.pattern}
          className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <FileWarning className="size-4 shrink-0" />
          <span className="flex-1">
            {s.trackedPaths.length > 0 ? (
              <>
                <span className="font-mono">{s.pattern}</span> ({s.label}) —{" "}
                <strong>{s.trackedPaths.length}</strong> file{s.trackedPaths.length === 1 ? " is" : "s are"}{" "}
                already committed. This almost always happens by accident.
              </>
            ) : (
              <>
                <span className="font-mono">{s.pattern}</span> ({s.label}) found but not yet
                committed — worth ignoring now before it is.
              </>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 text-xs"
            disabled={busy}
            onClick={() => (s.trackedPaths.length > 0 ? setConfirmTarget(s) : apply(s))}
          >
            {s.trackedPaths.length > 0 ? "Add to .gitignore & untrack" : "Add to .gitignore"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0"
            title="Dismiss for this session"
            onClick={() => setIgnored((prev) => new Set(prev).add(s.pattern))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Untrack {confirmTarget?.pattern}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {confirmTarget?.trackedPaths.length} file
              {confirmTarget && confirmTarget.trackedPaths.length === 1 ? "" : "s"} from git's index
              and adds {confirmTarget?.pattern} to .gitignore so they aren't re-added by accident.
              Nothing is deleted from disk — this only stops git from tracking them. You'll still
              need to commit this change afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmTarget && (
            <GitCommandPreview
              command={[
                `echo ${confirmTarget.pattern} >> .gitignore`,
                `git rm --cached -r ${confirmTarget.trackedPaths.length > 3 ? confirmTarget.pattern : confirmTarget.trackedPaths.join(" ")}`,
              ]}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmTarget && apply(confirmTarget)}>
              Untrack
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
