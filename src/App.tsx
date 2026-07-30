import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type View } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useAppStore } from "@/store/appStore";

function App() {
  const [view, setView] = useState<View>("dashboard");
  const refreshAll = useAppStore((s) => s.refreshAll);
  const loaded = useAppStore((s) => s.loaded);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
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
    </div>
  );
}

export default App;
