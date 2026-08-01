import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/// Wraps a trigger (usually an icon button) with a tooltip showing the
/// literal git command(s) it runs, plus an optional plain-English label —
/// aimed at people still learning git who want to know what a button
/// actually does before clicking it.
export function GitCommandTooltip({
  label,
  command,
  children,
}: {
  label?: string;
  command: string | string[];
  children: ReactNode;
}) {
  const commands = Array.isArray(command) ? command : [command];
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="flex max-w-sm flex-col items-start gap-1">
        {label && <div className="font-medium">{label}</div>}
        <div className="flex flex-col gap-0.5 font-mono text-[11px] opacity-90">
          {commands.map((c, i) => (
            <div key={i}>$ {c}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
