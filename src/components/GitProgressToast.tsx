import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export type GitToastState =
  | { variant: "progress"; stage: string | null; percent: number | null }
  | { variant: "success"; message: string }
  | { variant: "error"; message: string; hint?: string };

// Sonner's own default toast lifetime — the success/error state still
// auto-dismisses like every other toast in the app, unlike the progress
// state (duration: Infinity below), which must stay up for the whole
// operation.
const DEFAULT_TOAST_DURATION_MS = 4000;

// toast.custom() renders with data-styled="false" (sonner's own doing —
// see its source: `"data-styled": !Boolean(toast.jsx || ...)`), which
// strips ALL of sonner's default toast chrome: background, border, width,
// padding, shadow. Multiple stacked custom toasts then have nothing opaque
// to visually separate them, so they render as overlapping bare text
// instead of a clean card stack. This wrapper reinstates that chrome by
// hand, reusing sonner's own `--width`/`--border-radius` CSS vars (already
// set on the ancestor toast element) so it matches every other toast's
// size exactly instead of guessing a fixed width.
function GitProgressToast({ label, state }: { label: string; state: GitToastState }) {
  let content: React.ReactNode;
  if (state.variant === "success") {
    content = (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>{state.message}</span>
      </div>
    );
  } else if (state.variant === "error") {
    content = (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <XCircle className="size-4 shrink-0 text-destructive" />
          <span>{state.message}</span>
        </div>
        {state.hint && <span className="text-xs text-muted-foreground">{state.hint}</span>}
      </div>
    );
  } else {
    content = (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span>{label}</span>
          <span className="tabular-nums text-muted-foreground">{state.percent ?? 0}%</span>
        </div>
        <Progress value={state.percent ?? 0} />
        {state.stage && <span className="text-xs text-muted-foreground">{state.stage}</span>}
      </div>
    );
  }
  return (
    <div className="w-[var(--width)] rounded-[var(--border-radius)] border bg-popover p-4 text-sm text-popover-foreground shadow-lg">
      {content}
    </div>
  );
}

// One component covering all three lifecycle states of a slow git op
// (clone/fetch/push), always shown via toast.custom under the same id —
// sonner's toast.error/toast.success don't clear a toast's `jsx` once
// toast.custom has set it, so switching a pinned toast from the progress
// bar to a plain success/error call would keep rendering the stale
// progress bar forever. Rendering every state through toast.custom
// sidesteps that entirely.
export function showGitProgressToast(id: string, label: string, state: GitToastState) {
  toast.custom(() => <GitProgressToast label={label} state={state} />, {
    id,
    duration: state.variant === "progress" ? Infinity : DEFAULT_TOAST_DURATION_MS,
  });
}
