import { Terminal } from "lucide-react";

/// Shown alongside confirmation dialogs for git operations — surfaces the
/// actual command(s) about to run instead of hiding them behind a button,
/// so using GitSplash also teaches real git rather than creating a second
/// dependency on a GUI to get anything done.
export function GitCommandPreview({ command }: { command: string | string[] }) {
  const commands = Array.isArray(command) ? command : [command];
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Terminal className="size-3" /> What this runs
      </div>
      <div className="flex flex-col gap-0.5 font-mono text-xs">
        {commands.map((c, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-muted-foreground select-none">$</span>
            <span className="break-all">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
