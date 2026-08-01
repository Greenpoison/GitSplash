import { cn } from "@/lib/utils";
import { COMPARE_STATUS_DOT, COMPARE_STATUS_LABEL } from "@/lib/compareFileStatus";
import type { CompareFile } from "@/lib/types";

/// A compact "+N -M" alongside the existing status dot, for file lists that
/// already resolve a fixed two-ref comparison (branch vs branch, or a
/// commit vs its parent) — not shown in the live Changes tab, where a
/// partially-staged file's insertions/deletions would need to be split
/// between the staged and unstaged portions.
export function DiffStatBadge({ file }: { file: CompareFile }) {
  const hasStats = file.insertions !== null || file.deletions !== null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {hasStats && (
        <span className="font-mono text-[10px]">
          {file.insertions !== null && (
            <span className="text-emerald-600 dark:text-emerald-400">+{file.insertions}</span>
          )}
          {file.insertions !== null && file.deletions !== null && " "}
          {file.deletions !== null && (
            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          )}
        </span>
      )}
      <span
        className={cn("size-1.5 shrink-0 rounded-full", COMPARE_STATUS_DOT[file.status])}
        title={COMPARE_STATUS_LABEL[file.status]}
      />
    </span>
  );
}
