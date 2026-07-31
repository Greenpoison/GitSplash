import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportGitError } from "@/lib/gitErrors";
import { KeyRound, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { GpgKeyPickerDialog } from "./GpgKeyPickerDialog";
import { GpgPublicKeyDialog } from "./GpgPublicKeyDialog";
import { PublicKeyDialog } from "./PublicKeyDialog";

function AccountRow({ account }: { account: Account }) {
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);
  const [ghAuthed, setGhAuthed] = useState<boolean | null>(null);
  const [keyDialog, setKeyDialog] = useState<"auth" | "signing" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [gpgPickerOpen, setGpgPickerOpen] = useState(false);
  const [gpgKeyDialogOpen, setGpgKeyDialogOpen] = useState(false);
  const [switchingSigning, setSwitchingSigning] = useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [togglingHttpsPort, setTogglingHttpsPort] = useState(false);

  const toggleSshOverHttps = async (enabled: boolean) => {
    setTogglingHttpsPort(true);
    try {
      await api.setAccountSshOverHttps(account.id, enabled);
      await refreshAccounts();
      toast.success(enabled ? "Now routing SSH over port 443" : "Back to routing SSH over port 22");
    } catch (e) {
      reportGitError(e);
    } finally {
      setTogglingHttpsPort(false);
    }
  };

  useEffect(() => {
    if (!account.githubUsername) {
      setGhAuthed(null);
      return;
    }
    api.isAccountGhAuthenticated(account.id).then(setGhAuthed).catch(() => setGhAuthed(false));
  }, [account.id, account.githubUsername]);

  const generateSigning = async () => {
    if (account.signingMethod === "gpg") {
      setConfirmGenerateOpen(true);
      return;
    }
    await doGenerateSigning();
  };

  const doGenerateSigning = async () => {
    setConfirmGenerateOpen(false);
    setGenerating(true);
    try {
      const result = await api.generateSigningKey(account.id);
      await refreshAccounts();
      if (result.githubUploadError) {
        toast.warning("Signing key generated, but couldn't register it with GitHub", {
          description: result.githubUploadError,
        });
      } else {
        toast.success("Signing key generated and switched to SSH signing");
      }
    } catch (e) {
      reportGitError(e);
    } finally {
      setGenerating(false);
    }
  };

  const switchToSsh = async () => {
    setSwitchingSigning(true);
    try {
      await api.setAccountSshSigning(account.id);
      await refreshAccounts();
      toast.success(
        account.signingKeyPath
          ? "Switched to SSH signing"
          : "Switched to SSH signing, but no signing key exists yet — commits will be unsigned until you generate one",
      );
    } catch (e) {
      reportGitError(e);
    } finally {
      setSwitchingSigning(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteAccount(account.id);
      await refreshAccounts();
    } catch (e) {
      reportGitError(e);
    }
  };

  return (
    <div className="gradient-border flex flex-col gap-2 rounded-md bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{account.name}</span>
        <Badge variant="outline">{account.hostAlias}</Badge>
        {account.githubUsername && <Badge variant="secondary">@{account.githubUsername}</Badge>}
        {account.githubUsername && (
          <Badge variant={ghAuthed ? "default" : "outline"} className="text-[10px]">
            {ghAuthed === null ? "checking gh…" : ghAuthed ? "gh authenticated" : "gh not signed in"}
          </Badge>
        )}
        {account.signingMethod === "gpg" && (
          <Badge variant="outline" className="text-[10px]">
            GPG signing
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
        {account.signingMethod === "gpg" ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setGpgKeyDialogOpen(true)}>
              <PenLine className="size-3.5" /> GPG public key
            </Button>
            <Button size="sm" variant="outline" onClick={switchToSsh} disabled={switchingSigning}>
              {switchingSigning ? "Switching…" : "Switch to SSH signing"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setGpgPickerOpen(true)}>
            <ShieldCheck className="size-3.5" /> Use GPG signing…
          </Button>
        )}
      </div>
      {account.hostname === "github.com" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={account.useSshOverHttps}
                disabled={togglingHttpsPort}
                onCheckedChange={(c) => toggleSshOverHttps(!!c)}
              />
              <Label className="font-normal">Use port 443 for SSH</Label>
            </label>
          </TooltipTrigger>
          <TooltipContent>
            For networks that block outbound SSH on port 22 — routes over ssh.github.com:443
            instead, GitHub's own workaround for this.
          </TooltipContent>
        </Tooltip>
      )}
      {keyDialog && (
        <PublicKeyDialog
          accountId={account.id}
          keyKind={keyDialog}
          open={!!keyDialog}
          onOpenChange={(o) => !o && setKeyDialog(null)}
        />
      )}
      <GpgKeyPickerDialog
        accountId={account.id}
        open={gpgPickerOpen}
        onOpenChange={setGpgPickerOpen}
        onDone={refreshAccounts}
      />
      {account.gpgKeyId && (
        <GpgPublicKeyDialog
          gpgKeyId={account.gpgKeyId}
          open={gpgKeyDialogOpen}
          onOpenChange={setGpgKeyDialogOpen}
        />
      )}

      <AlertDialog open={confirmGenerateOpen} onOpenChange={setConfirmGenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch away from GPG signing?</AlertDialogTitle>
            <AlertDialogDescription>
              "{account.name}" is currently set to sign commits with GPG. Generating an SSH
              signing key switches it to SSH signing instead, for every repo assigned to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doGenerateSigning}>Generate & switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AccountsPanel() {
  const accounts = useAppStore((s) => s.accounts);
  const setCreateAccountDialogOpen = useAppStore((s) => s.setCreateAccountDialogOpen);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Each account gets its own SSH key pair and ~/.ssh/config host alias. Assigning an
          account to a repo rewrites its remote URL to use that alias.
        </p>
        <Button size="sm" data-tutorial="add-account" onClick={() => setCreateAccountDialogOpen(true)}>
          Add account
        </Button>
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
