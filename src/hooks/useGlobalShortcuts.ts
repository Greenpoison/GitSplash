import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { useUndoStore } from "@/store/undoStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/// Global keyboard shortcuts. Ctrl/Cmd-combos fire even while typing (that's
/// standard — plain letters never reach an input via a modifier chord), but
/// bare-key shortcuts like "?" are suppressed while typing so they don't
/// leak into whatever the user is writing.
export function useGlobalShortcuts() {
  const setView = useAppStore((s) => s.setView);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAddRepoDialogOpen = useAppStore((s) => s.setAddRepoDialogOpen);
  const setGroupManagerOpen = useAppStore((s) => s.setGroupManagerOpen);
  const setShortcutsHelpOpen = useAppStore((s) => s.setShortcutsHelpOpen);
  const requestUndo = useUndoStore((s) => s.requestUndo);
  const requestRedo = useUndoStore((s) => s.requestRedo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Deliberately deferring to native text-field undo/redo here — a
      // user editing a commit message expects Ctrl+Z to undo their typing,
      // not reset the repo's HEAD.
      if (ctrl && key === "z" && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (e.shiftKey) requestRedo();
        else requestUndo();
      } else if (ctrl && key === "y" && !isTypingTarget(e.target)) {
        e.preventDefault();
        requestRedo();
      } else if (ctrl && key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (ctrl && key === "n") {
        e.preventDefault();
        setAddRepoDialogOpen(true);
      } else if (ctrl && e.shiftKey && key === "g") {
        e.preventDefault();
        setGroupManagerOpen(true);
      } else if (ctrl && key === "1") {
        e.preventDefault();
        setView("dashboard");
      } else if (ctrl && key === "2") {
        e.preventDefault();
        setView("secrets");
      } else if (ctrl && key === "3") {
        e.preventDefault();
        setView("settings");
      } else if (!ctrl && key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsHelpOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    setView,
    setCommandPaletteOpen,
    setAddRepoDialogOpen,
    setGroupManagerOpen,
    setShortcutsHelpOpen,
    requestUndo,
    requestRedo,
  ]);
}
