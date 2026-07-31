import type { CompareFileStatus } from "@/lib/types";

export const COMPARE_STATUS_LABEL: Record<CompareFileStatus, string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
};

export const COMPARE_STATUS_DOT: Record<CompareFileStatus, string> = {
  added: "bg-emerald-500",
  modified: "bg-amber-500",
  deleted: "bg-red-500",
  renamed: "bg-violet-500",
  copied: "bg-violet-500",
};
