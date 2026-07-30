import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUndoStore } from "@/store/undoStore";

export function UndoRedoControls() {
  const undoStack = useUndoStore((s) => s.undoStack);
  const redoStack = useUndoStore((s) => s.redoStack);
  const busy = useUndoStore((s) => s.busy);
  const requestUndo = useUndoStore((s) => s.requestUndo);
  const requestRedo = useUndoStore((s) => s.requestRedo);

  const undoEntry = undoStack[undoStack.length - 1];
  const redoEntry = redoStack[redoStack.length - 1];

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
        <TooltipContent>{undoEntry ? `Undo: ${undoEntry.label}` : "Nothing to undo"}</TooltipContent>
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
        <TooltipContent>{redoEntry ? `Redo: ${redoEntry.label}` : "Nothing to redo"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
