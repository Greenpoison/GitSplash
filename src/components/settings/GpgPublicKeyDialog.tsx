import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";

export function GpgPublicKeyDialog({
  gpgKeyId,
  open,
  onOpenChange,
}: {
  gpgKeyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .getGpgPublicKey(gpgKeyId)
      .then(setKey)
      .catch((e) => reportGitError(e));
  }, [open, gpgKeyId]);

  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>GPG public key</DialogTitle>
          <DialogDescription>
            Add this to GitHub under Settings → SSH and GPG keys → New GPG key.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">{key ?? "Loading…"}</pre>
          <Button size="icon" variant="outline" onClick={copy} disabled={!key}>
            <Copy className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
