import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { Repo, SubmoduleInfo } from "@/lib/types";

const STATUS_LABEL: Record<SubmoduleInfo["status"], string> = {
  "up-to-date": "up to date",
  modified: "modified",
  uninitialized: "not initialized",
  conflict: "conflict",
};

const STATUS_VARIANT: Record<SubmoduleInfo["status"], "secondary" | "outline" | "destructive"> = {
  "up-to-date": "secondary",
  modified: "outline",
  uninitialized: "outline",
  conflict: "destructive",
};

export function SubmodulesPanel({ repo }: { repo: Repo }) {
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setSubmodules(await api.listSubmodules(repo.id));
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const update = async (paths: string[]) => {
    setBusy(true);
    try {
      await api.updateSubmodules(repo.id, paths);
      toast.success(paths.length === 0 ? "Updated all submodules" : `Updated ${paths.join(", ")}`);
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {submodules.length === 0 ? (
        <p className="text-sm text-muted-foreground">This repo has no submodules.</p>
      ) : (
        <>
          <div className="gradient-border flex flex-col gap-2 rounded-md bg-card p-3">
            {submodules.map((s) => (
              <div key={s.path} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                <span className="flex-1 truncate font-mono">{s.path}</span>
                <span className={cn("font-mono text-muted-foreground")}>{s.sha.slice(0, 7)}</span>
                <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={busy}
                  onClick={() => update([s.path])}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="self-start" onClick={() => update([])} disabled={busy}>
            <RefreshCw className="size-3.5" /> Update all submodules
          </Button>
        </>
      )}
    </div>
  );
}
