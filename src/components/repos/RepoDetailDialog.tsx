import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/appStore";
import type { Repo } from "@/lib/types";
import { BranchesPanel } from "./BranchesPanel";
import { ChangesPanel } from "./ChangesPanel";
import { FileEditorPanel } from "./FileEditorPanel";
import { FileHistoryPanel } from "./FileHistoryPanel";
import { PullRequestsPanel } from "./PullRequestsPanel";
import { SecretsPanel } from "./SecretsPanel";
import { SubmodulesPanel } from "./SubmodulesPanel";
import { WorktreesPanel } from "./WorktreesPanel";

type PendingAction = { type: "tab"; tab: string } | { type: "close" };

export function RepoDetailDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const [activeTab, setActiveTab] = useState("changes");
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const requestTabChange = (tab: string) => {
    if (editorDirty && activeTab === "editor" && tab !== activeTab) {
      setPendingAction({ type: "tab", tab });
      return;
    }
    setActiveTab(tab);
  };

  const requestOpenChange = (o: boolean) => {
    if (!o && editorDirty) {
      setPendingAction({ type: "close" });
      return;
    }
    onOpenChange(o);
  };

  const confirmPending = () => {
    if (!pendingAction) return;
    setEditorDirty(false);
    if (pendingAction.type === "tab") setActiveTab(pendingAction.tab);
    else onOpenChange(false);
    setPendingAction(null);
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex h-[97vh] max-h-[97vh] w-[98vw] sm:max-w-[98vw] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{repo.displayName}</DialogTitle>
        </DialogHeader>
        {/* Header and tab bar stay fixed; only the active tab's content
            scrolls, so a tall panel (e.g. Branches, with its buttons +
            gitflow panel + commit graph all stacked) never pushes the tab
            bar itself out of view. */}
        <Tabs value={activeTab} onValueChange={requestTabChange} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full shrink-0 justify-start overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="changes" className="shrink-0">Changes</TabsTrigger>
            <TabsTrigger value="branches" className="shrink-0">Branches</TabsTrigger>
            <TabsTrigger value="worktrees" className="shrink-0">Worktrees</TabsTrigger>
            <TabsTrigger value="submodules" className="shrink-0">Submodules</TabsTrigger>
            <TabsTrigger value="filehistory" className="shrink-0">File History</TabsTrigger>
            <TabsTrigger value="editor" className="shrink-0">Editor</TabsTrigger>
            <TabsTrigger value="prs" className="shrink-0">Pull Requests</TabsTrigger>
            <TabsTrigger value="secrets" className="shrink-0">Secrets</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="changes">
              <ChangesPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
            </TabsContent>
            <TabsContent value="branches">
              <BranchesPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
            </TabsContent>
            <TabsContent value="worktrees">
              <WorktreesPanel repo={repo} />
            </TabsContent>
            <TabsContent value="submodules">
              <SubmodulesPanel repo={repo} />
            </TabsContent>
            <TabsContent value="filehistory">
              <FileHistoryPanel repo={repo} />
            </TabsContent>
            <TabsContent value="editor">
              <FileEditorPanel repo={repo} onDirtyChange={setEditorDirty} />
            </TabsContent>
            <TabsContent value="prs">
              <PullRequestsPanel repo={repo} />
            </TabsContent>
            <TabsContent value="secrets">
              <SecretsPanel repo={repo} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved editor changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "close"
                ? "Closing this dialog discards your edits — they were never saved to disk."
                : "Switching tabs discards your edits — they were never saved to disk."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>Discard & continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
