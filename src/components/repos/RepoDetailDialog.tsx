import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import type { Repo } from "@/lib/types";
import { BranchesPanel } from "./BranchesPanel";
import { ChangesPanel } from "./ChangesPanel";
import { FileEditorPanel } from "./FileEditorPanel";
import { FileHistoryPanel } from "./FileHistoryPanel";
import { HistorySearchPanel } from "./HistorySearchPanel";
import { LocallyIgnoredPanel } from "./LocallyIgnoredPanel";
import { PullRequestsPanel } from "./PullRequestsPanel";
import { ReflogPanel } from "./ReflogPanel";
import { SecretsPanel } from "./SecretsPanel";
import { SubmodulesPanel } from "./SubmodulesPanel";
import { TagsPanel } from "./TagsPanel";
import { WorktreesPanel } from "./WorktreesPanel";

type PendingAction = { type: "tab"; tab: string } | { type: "close" };

/// Changes, Branches, and Pull Requests cover the entire push-a-branch,
/// open-a-PR, merge-on-GitHub workflow — everything else here is a more
/// advanced git concept a beginner following just that flow never needs to
/// see by default. Tucked behind "More" instead of removed: still one click
/// away, just not competing for attention in the tab bar.
const SECONDARY_TABS = [
  { value: "tags", label: "Tags" },
  { value: "filehistory", label: "File History" },
  { value: "search", label: "Search History" },
  { value: "recover", label: "Recover" },
  { value: "editor", label: "Editor" },
  { value: "worktrees", label: "Worktrees" },
  { value: "submodules", label: "Submodules" },
  { value: "secrets", label: "Secrets" },
  { value: "locallyignored", label: "Locally Ignored" },
];

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
            <TabsTrigger value="prs" className="shrink-0">Pull Requests</TabsTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    SECONDARY_TABS.some((t) => t.value === activeTab)
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  More <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SECONDARY_TABS.map((t) => (
                  <DropdownMenuItem key={t.value} onClick={() => requestTabChange(t.value)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="changes">
              <ChangesPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
            </TabsContent>
            <TabsContent value="branches">
              <BranchesPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
            </TabsContent>
            <TabsContent value="tags">
              <TagsPanel repo={repo} />
            </TabsContent>
            <TabsContent value="prs">
              <PullRequestsPanel repo={repo} />
            </TabsContent>
            <TabsContent value="filehistory">
              <FileHistoryPanel repo={repo} />
            </TabsContent>
            <TabsContent value="search">
              <HistorySearchPanel repo={repo} />
            </TabsContent>
            <TabsContent value="recover">
              <ReflogPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
            </TabsContent>
            <TabsContent value="editor">
              <FileEditorPanel repo={repo} onDirtyChange={setEditorDirty} />
            </TabsContent>
            <TabsContent value="worktrees">
              <WorktreesPanel repo={repo} />
            </TabsContent>
            <TabsContent value="submodules">
              <SubmodulesPanel repo={repo} />
            </TabsContent>
            <TabsContent value="secrets">
              <SecretsPanel repo={repo} />
            </TabsContent>
            <TabsContent value="locallyignored">
              <LocallyIgnoredPanel repo={repo} />
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
