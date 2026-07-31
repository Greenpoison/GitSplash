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
import { useAppStore } from "@/store/appStore";

export function UndoConfirmDialog() {
  const pending = useUndoStore((s) => s.pendingConfirm);
  const confirmPending = useUndoStore((s) => s.confirmPending);
  const cancelPending = useUndoStore((s) => s.cancelPending);
  const repos = useAppStore((s) => s.repos);

  const repoName = pending
    ? (repos.find((r) => r.id === pending.entry.repoId)?.displayName ?? "unknown repo")
    : "";

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && cancelPending()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.direction === "undo" ? "Undo" : "Redo"}: {pending?.entry.label} ({repoName})?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This resets {repoName} to a different commit — any commits made after this point, and
            any uncommitted changes, can become unreachable or discarded. Make sure nothing you
            still need would be lost.
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
