import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUpdateStore } from "@/store/updateStore";
import { useAppStore } from "@/store/appStore";

/// Checks for an update once on launch (if enabled in settings) and shows a
/// dismissible toast when one's found — clearing it just hides the toast
/// for this session, nothing is downloaded until "Update now" is clicked.
export function UpdateNotifier() {
  const settings = useAppStore((s) => s.settings);
  const available = useUpdateStore((s) => s.available);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const checkedOnLaunch = useRef(false);
  const shownForVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!settings || checkedOnLaunch.current) return;
    checkedOnLaunch.current = true;
    if (settings.checkForUpdates) {
      // Silent on failure — a launch-time connectivity hiccup shouldn't
      // greet the user with an error dialog before they've done anything.
      checkNow().catch(() => {});
    }
  }, [settings, checkNow]);

  useEffect(() => {
    if (!available || dismissed) return;
    if (shownForVersion.current === available.version) return;
    shownForVersion.current = available.version;

    toast(`GitSplash ${available.version} is available`, {
      description: available.body || `You're on ${available.currentVersion}.`,
      duration: Infinity,
      closeButton: true,
      onDismiss: dismiss,
      action: {
        label: "Update now",
        onClick: () => {
          toast.promise(install(), {
            loading: "Downloading update…",
            success: "Installed — restarting GitSplash…",
            error: (e) => `Update failed: ${String(e)}`,
          });
        },
      },
    });
  }, [available, dismissed, dismiss, install]);

  return null;
}
