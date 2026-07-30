import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { Account } from "@/lib/types";
import { CreateAccountDialog } from "./CreateAccountDialog";
import { PublicKeyDialog } from "./PublicKeyDialog";

function AccountRow({ account }: { account: Account }) {
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);
  const [ghAuthed, setGhAuthed] = useState<boolean | null>(null);
  const [keyDialog, setKeyDialog] = useState<"auth" | "signing" | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!account.githubUsername) {
      setGhAuthed(null);
      return;
    }
    api.isAccountGhAuthenticated(account.id).then(setGhAuthed).catch(() => setGhAuthed(false));
  }, [account.id, account.githubUsername]);

  const generateSigning = async () => {
    setGenerating(true);
    try {
      await api.generateSigningKey(account.id);
      await refreshAccounts();
      toast.success("Signing key generated");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteAccount(account.id);
      await refreshAccounts();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{account.name}</span>
        <Badge variant="outline">{account.hostAlias}</Badge>
        {account.githubUsername && <Badge variant="secondary">@{account.githubUsername}</Badge>}
        {account.githubUsername && (
          <Badge variant={ghAuthed ? "default" : "outline"} className="text-[10px]">
            {ghAuthed === null ? "checking gh…" : ghAuthed ? "gh authenticated" : "gh not signed in"}
          </Badge>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="ml-auto size-7">
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account "{account.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes it from GitSplash and its ~/.ssh/config Host block. The key files
                themselves are left on disk. Repos assigned to this account will need a new
                account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setKeyDialog("auth")}>
          <KeyRound className="size-3.5" /> Auth public key
        </Button>
        {account.signingKeyPath ? (
          <Button size="sm" variant="outline" onClick={() => setKeyDialog("signing")}>
            <PenLine className="size-3.5" /> Signing public key
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={generateSigning} disabled={generating}>
            <ShieldCheck className="size-3.5" />
            {generating ? "Generating…" : "Generate signing key"}
          </Button>
        )}
      </div>
      {keyDialog && (
        <PublicKeyDialog
          accountId={account.id}
          keyKind={keyDialog}
          open={!!keyDialog}
          onOpenChange={(o) => !o && setKeyDialog(null)}
        />
      )}
    </div>
  );
}

export function AccountsPanel() {
  const accounts = useAppStore((s) => s.accounts);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Each account gets its own SSH key pair and ~/.ssh/config host alias. Assigning an
          account to a repo rewrites its remote URL to use that alias.
        </p>
        <CreateAccountDialog />
      </div>
      <div className="flex flex-col gap-2">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        )}
      </div>
    </div>
  );
}
