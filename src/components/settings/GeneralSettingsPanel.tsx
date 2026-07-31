import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useUpdateStore } from "@/store/updateStore";

export function GeneralSettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setTutorialActive = useAppStore((s) => s.setTutorialActive);
  const [gitGuiPath, setGitGuiPath] = useState("");
  const [batchConcurrency, setBatchConcurrency] = useState(6);
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [saving, setSaving] = useState(false);
  const checkingUpdate = useUpdateStore((s) => s.checking);
  const checkUpdateNow = useUpdateStore((s) => s.checkNow);

  useEffect(() => {
    if (settings) {
      setGitGuiPath(settings.gitGuiPath ?? "");
      setBatchConcurrency(settings.batchConcurrency);
      setCheckForUpdates(settings.checkForUpdates);
    }
  }, [settings]);

  const pickExe = async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: "Executable", extensions: ["exe"] }],
    });
    if (typeof selected === "string") setGitGuiPath(selected);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings({
        gitGuiPath: gitGuiPath.trim() || null,
        batchConcurrency: Math.min(32, Math.max(1, batchConcurrency)),
        tutorialCompleted: settings?.tutorialCompleted ?? false,
        checkForUpdates,
      });
      await refreshSettings();
      toast.success("Settings saved");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const checkForUpdatesNow = async () => {
    try {
      const update = await checkUpdateNow();
      toast.success(update ? `Update available: ${update.version}` : "You're on the latest version");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const restartTutorial = async () => {
    if (!settings) return;
    try {
      // Clearing the flag alone wouldn't visibly do anything for most
      // users — the tutorial only auto-launches on a genuinely empty
      // install (no accounts/repos), which won't be true once you've
      // actually used the app. Start it immediately instead of just
      // waiting on a condition that may never occur again.
      await api.saveSettings({ ...settings, tutorialCompleted: false });
      await refreshSettings();
      setTutorialActive(true);
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="git-gui-path">Git GUI executable</Label>
        <div className="flex gap-2">
          <Input
            id="git-gui-path"
            value={gitGuiPath}
            onChange={(e) => setGitGuiPath(e.target.value)}
            placeholder="Leave blank to open File Explorer instead"
          />
          <Button type="button" variant="outline" size="icon" onClick={pickExe}>
            <FolderOpen className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Used when you click a repo card or choose "Open externally".
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="concurrency">Batch fetch/pull concurrency</Label>
        <Input
          id="concurrency"
          type="number"
          min={1}
          max={32}
          value={batchConcurrency}
          onChange={(e) => setBatchConcurrency(Number(e.target.value))}
          className="w-24"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={checkForUpdates}
          onCheckedChange={(c) => setCheckForUpdates(!!c)}
        />
        Check for updates on launch
      </label>

      <Button onClick={save} disabled={saving} className="w-fit">
        {saving ? "Saving…" : "Save settings"}
      </Button>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label>Updates</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={checkForUpdatesNow}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? "Checking…" : "Check for updates now"}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label>Tutorial</Label>
        <p className="text-xs text-muted-foreground">
          Walks through adding an account, adding a repo, making a group, and exploring a repo.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={restartTutorial}
          disabled={!settings}
        >
          Restart tutorial
        </Button>
      </div>
    </div>
  );
}
