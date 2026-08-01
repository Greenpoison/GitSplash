import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/// A small icon button that copies `value` to the clipboard and briefly
/// shows a checkmark for feedback — used anywhere a commit hash or branch
/// name is shown, since typing one out by hand invites typos.
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access denied/unavailable — nothing actionable to do here.
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn("size-5", className)}
      title={label ?? `Copy ${value}`}
      onClick={copy}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}
