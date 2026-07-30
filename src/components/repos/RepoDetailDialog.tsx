import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{repo.displayName}</DialogTitle>
        </DialogHeader>
        {/* Header and tab bar stay fixed; only the active tab's content
            scrolls, so a tall panel (e.g. Branches, with its buttons +
            gitflow panel + commit graph all stacked) never pushes the tab
            bar itself out of view. */}
        <Tabs defaultValue="changes" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full shrink-0 justify-start overflow-x-auto">
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
              <FileEditorPanel repo={repo} />
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
    </Dialog>
  );
}
