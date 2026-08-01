import { useEffect, useState } from "react";
import { reportGitError } from "@/lib/gitErrors";
import { AlertTriangle, CheckCircle2, Info, Stethoscope } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { HealthIssue, Repo } from "@/lib/types";

const SEVERITY_STYLES: Record<HealthIssue["severity"], string> = {
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-border bg-muted/30",
};

export function RepoHealthDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: Repo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [issues, setIssues] = useState<HealthIssue[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setIssues(null);
    api
      .runHealthCheck(repo.id)
      .then(setIssues)
      .catch((e) => {
        reportGitError(e);
        onOpenChange(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, repo.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="size-4" /> Repo health check
          </DialogTitle>
          <DialogDescription>
            A few quick checks for common issues — nothing here is enforced or fixed
            automatically.
          </DialogDescription>
        </DialogHeader>

        {issues === null ? (
          <p className="p-2 text-sm text-muted-foreground">Checking…</p>
        ) : issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" /> No issues found.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {issues.map((issue) => (
              <div key={issue.id} className={cn("rounded-md border p-3", SEVERITY_STYLES[issue.severity])}>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {issue.severity === "warning" ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Info className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {issue.title}
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{issue.detail}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
