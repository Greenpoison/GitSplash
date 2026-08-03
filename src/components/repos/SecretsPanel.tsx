import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Archive, FileWarning, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import type { Repo, SecretFile } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SecretsPanel({ repo }: { repo: Repo }) {
  const [files, setFiles] = useState<SecretFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      const found = await api.scanRepoSecrets(repo.id);
      setFiles(found);
      setSelected(new Set(found.map((f) => f.relativePath)));
    } catch (e) {
      reportGitError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);

  const exportBundle = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one file");
      return;
    }
    const dest = await saveDialog({
      defaultPath: `${repo.displayName}-secrets.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (!dest) return;
    setExporting(true);
    try {
      await api.exportSecretsBundle(repo.id, Array.from(selected), dest, password || undefined);
      toast.success(
        password
          ? "Encrypted bundle exported — you'll need the password on the other machine"
          : "Bundle exported (unencrypted)",
      );
      setPassword("");
    } catch (e) {
      reportGitError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
        <FileWarning className="size-4 shrink-0" />
        This flags files by name/extension (.env, .pem, id_rsa, etc.) in the current working
        tree — it doesn't scan file contents or git history, and isn't a substitute for a real
        secret scanner. Nothing leaves this machine until you export a bundle.
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? "Scanning…" : `${files.length} file${files.length === 1 ? "" : "s"} flagged`}
        </span>
        <Button size="sm" variant="outline" onClick={scan} disabled={loading}>
          <RefreshCw className="size-3.5" /> Rescan
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        {!loading && files.length === 0 && (
          <p className="text-sm text-muted-foreground">No secret-like files found.</p>
        )}
        {files.map((f) => (
          <div key={f.relativePath} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Checkbox
              checked={selected.has(f.relativePath)}
              onCheckedChange={(c) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (c) next.add(f.relativePath);
                  else next.delete(f.relativePath);
                  return next;
                });
              }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.relativePath}</span>
            <span className="text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 border-t pt-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="zip-password">Password (optional — leave blank for a plain zip)</Label>
          <Input
            id="zip-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="AES-256 encrypted if set"
          />
        </div>
        <Button onClick={exportBundle} disabled={exporting || selected.size === 0}>
          <Archive className="size-4" /> Bundle for export
        </Button>
      </div>
    </div>
  );
}
