import { useEffect, useState } from "react";
import { toast } from "sonner";
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

export function PublicKeyDialog({
  accountId,
  keyKind,
  open,
  onOpenChange,
}: {
  accountId: string;
  keyKind: "auth" | "signing";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .getPublicKey(accountId, keyKind)
      .then(setKey)
      .catch((e) => toast.error(String(e)));
  }, [open, accountId, keyKind]);

  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{keyKind === "auth" ? "Authentication" : "Signing"} public key</DialogTitle>
          <DialogDescription>
            Add this to GitHub under Settings →{" "}
            {keyKind === "auth" ? "SSH and GPG keys → New SSH key (Authentication)" : "SSH and GPG keys → New SSH key (Signing)"}.
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
