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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{repo.displayName}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="changes">
          <TabsList>
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
            <TabsTrigger value="submodules">Submodules</TabsTrigger>
            <TabsTrigger value="filehistory">File History</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="prs">Pull Requests</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
          </TabsList>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
