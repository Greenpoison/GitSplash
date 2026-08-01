import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useBackgroundOpsStore } from "@/store/backgroundOpsStore";

export function StatusBar() {
  const ops = useBackgroundOpsStore((s) => s.ops);

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t bg-muted/30 px-3 text-[11px] text-muted-foreground">
      {ops.length === 0 ? (
        <span>Ready</span>
      ) : (
        ops.map((op) => (
          <div key={op.id} className="flex items-center gap-1.5">
            {op.status === "running" && <Loader2 className="size-3 animate-spin" />}
            {op.status === "success" && (
              <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
            )}
            {op.status === "error" && <XCircle className="size-3 text-destructive" />}
            <span>{op.status === "running" ? op.label : (op.detail ?? op.label)}</span>
          </div>
        ))
      )}
    </div>
  );
}
