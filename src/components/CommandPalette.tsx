import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Download,
  ExternalLink,
  FolderPlus,
  GitPullRequestArrow,
  Keyboard,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setView = useAppStore((s) => s.setView);
  const setAddRepoDialogOpen = useAppStore((s) => s.setAddRepoDialogOpen);
  const setGroupManagerOpen = useAppStore((s) => s.setGroupManagerOpen);
  const setShortcutsHelpOpen = useAppStore((s) => s.setShortcutsHelpOpen);
  const repos = useAppStore((s) => s.repos);
  const groups = useAppStore((s) => s.groups);
  const refreshStatuses = useAppStore((s) => s.refreshStatuses);
  const { resolvedTheme, setTheme } = useTheme();

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const runBatch = (groupId: string, groupName: string, pull: boolean) => {
    setOpen(false);
    toast.promise(api.batchUpdateGroup(groupId, pull).then(() => refreshStatuses()), {
      loading: `${pull ? "Fetching & pulling" : "Fetching"} ${groupName}…`,
      success: `${pull ? "Fetch & pull" : "Fetch"} finished for ${groupName}`,
      error: (e) => String(e),
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => run(() => setView("dashboard"))}>
            <LayoutDashboard /> Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView("settings"))}>
            <Settings /> Go to Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => run(() => setAddRepoDialogOpen(true))}>
            <FolderPlus /> Add a repo
          </CommandItem>
          <CommandItem onSelect={() => run(() => setGroupManagerOpen(true))}>
            <Users /> Manage groups
          </CommandItem>
          <CommandItem onSelect={() => run(() => refreshStatuses())}>
            <RefreshCw /> Refresh all statuses
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />} Toggle theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setShortcutsHelpOpen(true))}>
            <Keyboard /> Show keyboard shortcuts
          </CommandItem>
        </CommandGroup>

        {groups.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Groups">
              {groups.map((g) => (
                <div key={g.id} className="contents">
                  <CommandItem onSelect={() => runBatch(g.id, g.name, false)}>
                    <Download /> Fetch {g.name}
                  </CommandItem>
                  <CommandItem onSelect={() => runBatch(g.id, g.name, true)}>
                    <GitPullRequestArrow /> Fetch &amp; pull {g.name}
                  </CommandItem>
                </div>
              ))}
            </CommandGroup>
          </>
        )}

        {repos.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Repos">
              {repos.map((r) => (
                <CommandItem
                  key={r.id}
                  onSelect={() => run(() => api.openRepoExternal(r.id).catch((e) => toast.error(String(e))))}
                >
                  <ExternalLink /> Open {r.displayName} externally
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
