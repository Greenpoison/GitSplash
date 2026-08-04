import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import { TUTORIAL_STEPS } from "@/lib/tutorialSteps";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";

const CARD_WIDTH = 320;
const CARD_MARGIN = 12;
const MAX_LOCATE_MS = 1500;
const LOCATE_POLL_MS = 50;

/// First-run walkthrough. Sits below dialogs in z-index (z-40 vs their
/// z-50) so opening a real dialog (e.g. after clicking the highlighted "Add
/// account" button) naturally covers it rather than fighting for space —
/// it reappears at the same step once that dialog closes. The dimmed
/// backdrop/highlight ring are pointer-events:none throughout so the user
/// can always click straight through to the real, highlighted control.
export function TutorialOverlay() {
  const tutorialActive = useAppStore((s) => s.tutorialActive);
  const setTutorialActive = useAppStore((s) => s.setTutorialActive);
  const setView = useAppStore((s) => s.setView);
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  // Re-locate the target whenever a repo/group/account is added or removed,
  // not just on step change — otherwise a user who adds a repo while
  // parked on the "Group a repo"/"Explore a repo" step (rather than
  // clicking Next first) never sees it pick up the newly-mounted card;
  // .length is enough since only presence/absence of an element matters
  // here, not any of these records' other fields changing.
  const repoCount = useAppStore((s) => s.repos.length);
  const groupCount = useAppStore((s) => s.groups.length);
  const accountCount = useAppStore((s) => s.accounts.length);

  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const step = TUTORIAL_STEPS[stepIndex];

  // This component never unmounts (it just renders null while inactive), so
  // without this, restarting the tour after finishing it once would resume
  // at whatever step it was left on instead of starting over from Welcome.
  useEffect(() => {
    if (tutorialActive) setStepIndex(0);
  }, [tutorialActive]);

  useEffect(() => {
    if (!tutorialActive) return;
    if (step.view) setView(step.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, stepIndex]);

  useEffect(() => {
    if (!tutorialActive) {
      setTargetRect(null);
      setTargetMissing(false);
      return;
    }
    // Reset to a neutral "still searching" state immediately, before the
    // search below even starts — without this, if locating the new step's
    // target is ever slow (or never resolves — see the polling comment
    // below), the card keeps showing the *previous* step's rect and body
    // text rather than this step's, which looks exactly like a tutorial
    // prompt pointing at the wrong button.
    setTargetRect(null);
    setTargetMissing(false);

    if (!step.target) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!);
      if (el) {
        el.scrollIntoView({ block: "center" });
        setTargetRect(el.getBoundingClientRect());
        setTargetMissing(false);
        return;
      }
      // Polls on a wall-clock timer rather than requestAnimationFrame:
      // rAF can stall indefinitely whenever the window isn't actively
      // painting (minimized, backgrounded, OS power-saving), which would
      // leave this effect waiting forever instead of ever giving up and
      // falling back to the centered "target not on screen yet" card.
      if (Date.now() - startedAt < MAX_LOCATE_MS) {
        timeoutRef.current = window.setTimeout(locate, LOCATE_POLL_MS);
      } else {
        setTargetRect(null);
        setTargetMissing(true);
      }
    };
    locate();

    const onResize = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, stepIndex, repoCount, groupCount, accountCount]);

  if (!tutorialActive) return null;

  const finish = async () => {
    setTutorialActive(false);
    if (settings) {
      try {
        await api.saveSettings({ ...settings, tutorialCompleted: true });
        await refreshSettings();
      } catch {
        // Not worth surfacing an error just for closing a tour.
      }
    }
  };

  const next = () => {
    if (stepIndex === TUTORIAL_STEPS.length - 1) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  };
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const cardStyle: CSSProperties = targetRect
    ? {
        position: "fixed",
        top: Math.min(window.innerHeight - 40, targetRect.bottom + CARD_MARGIN),
        left: Math.min(Math.max(CARD_MARGIN, targetRect.left), window.innerWidth - CARD_WIDTH - CARD_MARGIN),
        width: CARD_WIDTH,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: CARD_WIDTH,
      };

  return (
    <div className="fixed inset-0 z-40">
      {targetRect ? (
        <div
          className="fixed rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/55" style={{ pointerEvents: "none" }} />
      )}

      <div
        className="gradient-border flex flex-col gap-3 rounded-lg bg-popover p-4 text-popover-foreground shadow-lg"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={finish} title="Skip tutorial">
            <X className="size-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {targetMissing && step.fallbackBody ? step.fallbackBody : step.body}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStepIndex(i)}
                title={`Go to step ${i + 1}`}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === stepIndex ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={back} disabled={stepIndex === 0}>
              Back
            </Button>
            <Button size="sm" onClick={next}>
              {stepIndex === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
        <button
          onClick={finish}
          className="text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Skip tutorial
        </button>
      </div>
    </div>
  );
}
