import { useState } from "react";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { Copy, ExternalLink, LogIn, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { GhAuthProgress } from "@/lib/types";

const DEVICE_URL_PREFIX = "Open this URL to continue in your web browser: ";
const CODE_PREFIX = "! First copy your one-time code: ";

/// Driven by the store's createAccountDialogOpen flag (no built-in trigger
/// button) — it needs to open from more than one place (the Accounts panel
/// and the dashboard's first-run prompt), see AddRepoDialog for the pattern.
export function CreateAccountDialog() {
  const open = useAppStore((s) => s.createAccountDialogOpen);
  const setOpen = useAppStore((s) => s.setCreateAccountDialogOpen);
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const [hostAlias, setHostAlias] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceUrl, setDeviceUrl] = useState<string | null>(null);
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);

  const reset = () => {
    setName("");
    setHostAlias("");
    setGithubUsername("");
    setDeviceCode(null);
    setDeviceUrl(null);
  };

  const loginWithBrowser = async () => {
    if (!name.trim() || !hostAlias.trim()) {
      toast.error("Name and host alias are required");
      return;
    }
    setLoggingIn(true);
    setDeviceCode(null);
    setDeviceUrl(null);
    const unlisten = await listen<GhAuthProgress>("gh-auth-progress", (event) => {
      const { line } = event.payload;
      if (line.includes(CODE_PREFIX)) setDeviceCode(line.split(CODE_PREFIX).pop()?.trim() ?? null);
      if (line.includes(DEVICE_URL_PREFIX)) setDeviceUrl(line.split(DEVICE_URL_PREFIX).pop()?.trim() ?? null);
    });
    try {
      await api.createAccountViaBrowser(name.trim(), hostAlias.trim());
      await refreshAccounts();
      toast.success(`Account "${name}" created — key generated and uploaded to GitHub`);
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(String(e));
    } finally {
      unlisten();
      setLoggingIn(false);
    }
  };

  const submitManual = async () => {
    if (!name.trim() || !hostAlias.trim()) {
      toast.error("Name and host alias are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.createAccount(name.trim(), hostAlias.trim(), githubUsername.trim() || undefined);
      await refreshAccounts();
      toast.success(`Account "${name}" created — a new SSH key was generated`);
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New GitHub identity</DialogTitle>
          <DialogDescription className="text-foreground/80">
            Logging in generates an SSH key for you and uploads it to GitHub automatically. No
            manual copy-pasting required.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-name">Display name</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Work" disabled={loggingIn} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-alias">SSH host alias</Label>
            <Input
              id="acc-alias"
              value={hostAlias}
              onChange={(e) => setHostAlias(e.target.value)}
              placeholder="github.com-work"
              disabled={loggingIn}
            />
          </div>

          {loggingIn && (
            <div className="gradient-border-strong flex flex-col gap-2 rounded-md bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Waiting for you to approve in the browser…
              </div>
              {deviceCode && (
                <div className="flex items-center gap-2">
                  <span>
                    One-time code: <span className="font-mono font-semibold">{deviceCode}</span>
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    onClick={async () => {
                      await navigator.clipboard.writeText(deviceCode);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              )}
              {deviceUrl && (
                <a
                  href={deviceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary underline"
                >
                  <ExternalLink className="size-3" /> Didn't open automatically? Click here — {deviceUrl}
                </a>
              )}
              <p className="text-xs text-muted-foreground">Times out after 5 minutes.</p>
            </div>
          )}

          {!manual && !loggingIn && (
            <Button onClick={loginWithBrowser} disabled={loggingIn}>
              <LogIn className="size-4" /> Continue with GitHub
            </Button>
          )}

          {!loggingIn && (
            <button
              type="button"
              className="text-left text-xs text-muted-foreground underline"
              onClick={() => setManual((m) => !m)}
            >
              {manual ? "Use browser login instead" : "Set up manually instead"}
            </button>
          )}

          {manual && !loggingIn && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-username">GitHub username (optional, needed for PRs via gh)</Label>
              <Input
                id="acc-username"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="octocat"
              />
            </div>
          )}
        </div>
        {manual && !loggingIn && (
          <DialogFooter>
            <Button onClick={submitManual} disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
