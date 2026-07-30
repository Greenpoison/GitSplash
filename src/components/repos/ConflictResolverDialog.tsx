import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, FileWarning, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { ConflictFile } from "@/lib/types";

type Resolution = "ours" | "theirs" | "both-ours-first" | "both-theirs-first" | "custom";

export function ConflictResolverDialog({
  repoId,
  path,
  open,
  onOpenChange,
  onResolved,
}: {
  repoId: string;
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [file, setFile] = useState<ConflictFile | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const [customText, setCustomText] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setResolutions({});
    setCustomText({});
    api
      .getConflictSections(repoId, path)
      .then(setFile)
      .catch((e) => toast.error(String(e)));
  }, [open, repoId, path]);

  const conflictIndexes =
    file?.segments.map((s, i) => (s.kind === "conflict" ? i : -1)).filter((i) => i >= 0) ?? [];
  const allResolved = conflictIndexes.every((i) => resolutions[i] !== undefined);

  const resolvedContent = (index: number): string => {
    const seg = file!.segments[index];
    if (seg.kind !== "conflict") return "";
    const choice = resolutions[index];
    switch (choice) {
      case "ours":
        return seg.ours;
      case "theirs":
        return seg.theirs;
      case "both-ours-first":
        return [seg.ours, seg.theirs].filter(Boolean).join("\n");
      case "both-theirs-first":
        return [seg.theirs, seg.ours].filter(Boolean).join("\n");
      case "custom":
        return customText[index] ?? "";
      default:
        return "";
    }
  };

  const save = async () => {
    if (!file || !allResolved) return;
    const content = file.segments
      .map((seg, i) => (seg.kind === "plain" ? seg.text : resolvedContent(i)))
      .join("\n");
    setSaving(true);
    try {
      await api.writeResolvedFile(repoId, path, content);
      toast.success(`Resolved ${path}`);
      onResolved();
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const keepWholeFile = async (side: "ours" | "theirs") => {
    setSaving(true);
    try {
      if (side === "ours") await api.keepOurs(repoId, path);
      else await api.keepTheirs(repoId, path);
      toast.success(`Resolved ${path} (kept ${side})`);
      onResolved();
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{path}</DialogTitle>
        </DialogHeader>

        {!file && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}

        {file?.isBinary && (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileWarning className="size-4" /> Binary file — pick which version to keep.
            </div>
            <div className="flex gap-2">
              <Button onClick={() => keepWholeFile("ours")} disabled={saving}>
                Keep ours
              </Button>
              <Button onClick={() => keepWholeFile("theirs")} disabled={saving}>
                Keep theirs
              </Button>
            </div>
          </div>
        )}

        {file && !file.isBinary && (
          <>
            <ScrollArea className="gradient-border h-[420px] rounded-md bg-card p-3">
              <div className="flex flex-col gap-3 font-mono text-xs">
                {file.segments.map((seg, i) => {
                  if (seg.kind === "plain") {
                    if (!seg.text.trim()) return null;
                    return (
                      <div key={i} className="whitespace-pre-wrap text-muted-foreground">
                        {seg.text}
                      </div>
                    );
                  }
                  const choice = resolutions[i];
                  const isEditing = editing === i;
                  return (
                    <div key={i} className="overflow-hidden rounded-md border">
                      <div className="flex items-center gap-2 bg-muted/50 px-2 py-1">
                        <Badge variant="outline" className="text-[10px]">
                          Conflict
                        </Badge>
                        {choice && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" /> resolved: {choice}
                          </span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="ml-auto size-6"
                          onClick={() => {
                            setEditing(isEditing ? null : i);
                            if (!isEditing) {
                              setCustomText((prev) => ({
                                ...prev,
                                [i]: prev[i] ?? (choice ? resolvedContent(i) : seg.ours),
                              }));
                            }
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                          <Textarea
                            value={customText[i] ?? ""}
                            onChange={(e) => setCustomText((prev) => ({ ...prev, [i]: e.target.value }))}
                            rows={6}
                            className="font-mono text-xs"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              setResolutions((prev) => ({ ...prev, [i]: "custom" }));
                              setEditing(null);
                            }}
                          >
                            Use this text
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 divide-x">
                            <div className={cn("whitespace-pre-wrap p-2", "bg-emerald-500/10")}>
                              <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                                Ours ({seg.oursLabel})
                              </div>
                              {seg.ours}
                            </div>
                            <div className={cn("whitespace-pre-wrap p-2", "bg-blue-500/10")}>
                              <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                                Theirs ({seg.theirsLabel})
                              </div>
                              {seg.theirs}
                            </div>
                          </div>
                          <div className="flex gap-1 border-t p-1.5">
                            <Button
                              size="sm"
                              variant={choice === "ours" ? "default" : "outline"}
                              className="h-6 text-xs"
                              onClick={() => setResolutions((prev) => ({ ...prev, [i]: "ours" }))}
                            >
                              Accept Ours
                            </Button>
                            <Button
                              size="sm"
                              variant={choice === "theirs" ? "default" : "outline"}
                              className="h-6 text-xs"
                              onClick={() => setResolutions((prev) => ({ ...prev, [i]: "theirs" }))}
                            >
                              Accept Theirs
                            </Button>
                            <Button
                              size="sm"
                              variant={choice === "both-ours-first" ? "default" : "outline"}
                              className="h-6 text-xs"
                              onClick={() =>
                                setResolutions((prev) => ({ ...prev, [i]: "both-ours-first" }))
                              }
                            >
                              Accept Both
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter>
              <span className="mr-auto text-xs text-muted-foreground">
                {conflictIndexes.filter((i) => resolutions[i] !== undefined).length}/{conflictIndexes.length}{" "}
                blocks resolved
              </span>
              <Button onClick={save} disabled={!allResolved || saving}>
                {saving ? "Saving…" : "Save & mark resolved"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
