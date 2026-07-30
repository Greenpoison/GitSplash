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
import { useUndoStore } from "@/store/undoStore";

export function UndoConfirmDialog() {
  const pending = useUndoStore((s) => s.pendingConfirm);
  const confirmPending = useUndoStore((s) => s.confirmPending);
  const cancelPending = useUndoStore((s) => s.cancelPending);

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && cancelPending()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.direction === "undo" ? "Undo" : "Redo"}: {pending?.entry.label}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This resets the branch to a different commit and can discard any uncommitted changes
            made since — make sure nothing unsaved would be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmPending}>
            {pending?.direction === "undo" ? "Undo" : "Redo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
