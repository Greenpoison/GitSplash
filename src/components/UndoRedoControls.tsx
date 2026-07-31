import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUndoStore } from "@/store/undoStore";
import { useAppStore } from "@/store/appStore";

export function UndoRedoControls() {
  const undoStack = useUndoStore((s) => s.undoStack);
  const redoStack = useUndoStore((s) => s.redoStack);
  const busy = useUndoStore((s) => s.busy);
  const requestUndo = useUndoStore((s) => s.requestUndo);
  const requestRedo = useUndoStore((s) => s.requestRedo);
  const repos = useAppStore((s) => s.repos);

  const undoEntry = undoStack[undoStack.length - 1];
  const redoEntry = redoStack[redoStack.length - 1];

  // The undo/redo stack is shared across every repo — without naming the
  // repo here, undoing while viewing repo B can silently act on repo A,
  // wherever the last action actually happened.
  const repoName = (repoId: string) => repos.find((r) => r.id === repoId)?.displayName ?? "unknown repo";

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            disabled={!undoEntry || busy}
            onClick={requestUndo}
            aria-label="Undo"
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {undoEntry ? `Undo: ${undoEntry.label} (${repoName(undoEntry.repoId)})` : "Nothing to undo"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            disabled={!redoEntry || busy}
            onClick={requestRedo}
            aria-label="Redo"
          >
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {redoEntry ? `Redo: ${redoEntry.label} (${repoName(redoEntry.repoId)})` : "Nothing to redo"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
