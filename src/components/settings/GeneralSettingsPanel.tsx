import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function GeneralSettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const [gitGuiPath, setGitGuiPath] = useState("");
  const [batchConcurrency, setBatchConcurrency] = useState(6);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setGitGuiPath(settings.gitGuiPath ?? "");
      setBatchConcurrency(settings.batchConcurrency);
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
      });
      await refreshSettings();
      toast.success("Settings saved");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetTutorial = async () => {
    if (!settings) return;
    try {
      await api.saveSettings({ ...settings, tutorialCompleted: false });
      await refreshSettings();
      toast.success("Tutorial will show next time you launch GitSplash");
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
      <Button onClick={save} disabled={saving} className="w-fit">
        {saving ? "Saving…" : "Save settings"}
      </Button>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label>Tutorial</Label>
        <p className="text-xs text-muted-foreground">
          {settings?.tutorialCompleted
            ? "You've already been through the first-run tutorial."
            : "The first-run tutorial hasn't been completed yet — it auto-launches only when there are no accounts or repos."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={resetTutorial}
          disabled={!settings || !settings.tutorialCompleted}
        >
          Reset tutorial
        </Button>
      </div>
    </div>
  );
}
