import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GpgKeyInfo } from "@/lib/types";

export function GpgKeyPickerDialog({
  accountId,
  open,
  onOpenChange,
  onDone,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [keys, setKeys] = useState<GpgKeyInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKeys(null);
    setSelected(null);
    api
      .listGpgSecretKeys()
      .then(setKeys)
      .catch((e) => toast.error(String(e)));
  }, [open]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.setAccountGpgSigning(accountId, selected);
      toast.success("Now signing with GPG");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign with a GPG key</DialogTitle>
          <DialogDescription>
            Pick an existing key from your local GPG keyring. GitSplash doesn't generate GPG keys
            itself — create one first with <code className="font-mono">gpg --full-generate-key</code>{" "}
            if you don't have one yet.
          </DialogDescription>
        </DialogHeader>

        {keys === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {keys?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No local GPG secret keys found. Generate one with{" "}
            <code className="font-mono">gpg --full-generate-key</code>, then try again.
          </p>
        )}
        {keys && keys.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {keys.map((k) => (
              <button
                key={k.keyId}
                onClick={() => setSelected(k.keyId)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs",
                  selected === k.keyId ? "border-primary bg-primary/5" : "hover:bg-accent",
                )}
              >
                {selected === k.keyId && <Check className="size-3.5 text-primary" />}
                <span className="min-w-0 flex-1 truncate">{k.uid}</span>
                <span className="shrink-0 font-mono text-muted-foreground">{k.keyId}</span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={!selected || saving}>
            {saving ? "Saving…" : "Use this key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
