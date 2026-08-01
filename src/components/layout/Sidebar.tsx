import { BookOpen, HelpCircle, LayoutDashboard, Lock, Merge, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { UndoRedoControls } from "@/components/UndoRedoControls";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore, type View } from "@/store/appStore";

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "secrets", label: "Secrets", icon: Lock },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setShortcutsHelpOpen = useAppStore((s) => s.setShortcutsHelpOpen);
  const setGlossaryOpen = useAppStore((s) => s.setGlossaryOpen);

  return (
    <aside className="gradient-border-r flex h-full w-56 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <Merge className="size-5 text-primary" />
        <span className="gradient-text text-lg font-semibold tracking-tight">GitSplash</span>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 px-4 py-4">
        <div className="flex items-center gap-1">
          <UndoRedoControls />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Open command palette"
                onClick={() => setCommandPaletteOpen(true)}
              >
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Command palette (Ctrl+K)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Show keyboard shortcuts"
                onClick={() => setShortcutsHelpOpen(true)}
              >
                <HelpCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Show git glossary"
                onClick={() => setGlossaryOpen(true)}
              >
                <BookOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Git glossary</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">v{__APP_VERSION__}</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
