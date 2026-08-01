import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SecretsPage } from "@/components/secrets/SecretsPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsHelpDialog } from "@/components/ShortcutsHelpDialog";
import { GlossaryDialog } from "@/components/GlossaryDialog";
import { UndoConfirmDialog } from "@/components/UndoConfirmDialog";
import { CreateAccountDialog } from "@/components/settings/CreateAccountDialog";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useAppStore } from "@/store/appStore";

function App() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const loaded = useAppStore((s) => s.loaded);
  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const repos = useAppStore((s) => s.repos);
  const setTutorialActive = useAppStore((s) => s.setTutorialActive);

  useGlobalShortcuts();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // A second pass shortly after boot, on top of the one refreshAll() just
  // did — catches a status read that raced some other process touching a
  // repo's files right around launch (e.g. a build tool, or another git
  // client), which a single check right at mount could still miss.
  useEffect(() => {
    const timeout = setTimeout(() => refreshStatuses(), 5_000);
    return () => clearTimeout(timeout);
  }, [refreshStatuses]);

  // Auto-launch the first-run tutorial exactly once per load, only on a
  // genuinely empty install (no accounts, no repos) — not e.g. every time
  // someone removes their last repo.
  const checkedTutorial = useRef(false);
  useEffect(() => {
    if (!loaded || checkedTutorial.current || !settings) return;
    checkedTutorial.current = true;
    if (!settings.tutorialCompleted && accounts.length === 0 && repos.length === 0) {
      setTutorialActive(true);
    }
  }, [loaded, settings, accounts.length, repos.length, setTutorialActive]);

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
          ) : view === "secrets" ? (
            <SecretsPage />
          ) : (
            <SettingsPage />
          )}
        </main>
        <Toaster />
        <CommandPalette />
        <ShortcutsHelpDialog />
        <GlossaryDialog />
        <UndoConfirmDialog />
        <CreateAccountDialog />
        <TutorialOverlay />
        <UpdateNotifier />
      </div>
    </TooltipProvider>
  );
}

export default App;
