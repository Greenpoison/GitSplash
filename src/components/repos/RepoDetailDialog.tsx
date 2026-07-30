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
import { PullRequestsPanel } from "./PullRequestsPanel";
import { SecretsPanel } from "./SecretsPanel";

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{repo.displayName}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="branches">
          <TabsList>
            <TabsTrigger value="branches">Branches &amp; History</TabsTrigger>
            <TabsTrigger value="prs">Pull Requests</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
          </TabsList>
          <TabsContent value="branches">
            <BranchesPanel repo={repo} onChanged={() => refreshStatuses([repo.id])} />
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
