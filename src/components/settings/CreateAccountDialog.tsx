import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hostAlias, setHostAlias] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);

  const submit = async () => {
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
      setName("");
      setHostAlias("");
      setGithubUsername("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New GitHub identity</DialogTitle>
          <DialogDescription>
            Generates a new ed25519 SSH key and a Host alias in your ~/.ssh/config. Existing SSH
            config entries are left untouched.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-name">Display name</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Work" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-alias">SSH host alias</Label>
            <Input
              id="acc-alias"
              value={hostAlias}
              onChange={(e) => setHostAlias(e.target.value)}
              placeholder="github.com-work"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-username">GitHub username (optional, needed for PRs via gh)</Label>
            <Input
              id="acc-username"
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
              placeholder="octocat"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
