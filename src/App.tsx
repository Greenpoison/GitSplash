import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsHelpDialog } from "@/components/ShortcutsHelpDialog";
import { UndoConfirmDialog } from "@/components/UndoConfirmDialog";
import { CreateAccountDialog } from "@/components/settings/CreateAccountDialog";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useAppStore } from "@/store/appStore";

function App() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const loaded = useAppStore((s) => s.loaded);

  useGlobalShortcuts();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar view={view} onChange={setView} />
        <main className="flex-1 overflow-y-auto">
          {!loaded ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : view === "dashboard" ? (
            <Dashboard />
          ) : (
            <SettingsPage />
          )}
        </main>
        <Toaster />
        <CommandPalette />
        <ShortcutsHelpDialog />
        <UndoConfirmDialog />
        <CreateAccountDialog />
      </div>
    </TooltipProvider>
  );
}

export default App;
