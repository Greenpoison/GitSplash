import { toast } from "sonner";

interface TranslatedError {
  message: string;
  hint?: string;
}

/// Common git/gh stderr patterns, translated into plain English with a
/// suggested next step. Anything not recognized here falls through
/// unchanged — this only adds clarity for known cases, it never hides
/// information for ones it doesn't recognize.
const PATTERNS: { test: RegExp; translate: (match: RegExpMatchArray) => TranslatedError }[] = [
  {
    test: /Permission denied \(publickey\)/i,
    translate: () => ({
      message: "GitHub rejected the SSH key for this repo's account.",
      hint: "Check that the account's auth key is actually added on GitHub (Settings > Accounts > Auth public key), and that the right account is assigned to this repo.",
    }),
  },
  {
    test: /Could not resolve host|Connection timed out|Network is unreachable/i,
    translate: () => ({
      message: "Couldn't reach the remote — this looks like a network problem, not a git problem.",
      hint: "Check your internet connection. If you're on a restrictive network, outbound SSH (port 22) may be blocked — try \"Use port 443 for SSH\" on the account in Settings.",
    }),
  },
  {
    test: /refusing to merge unrelated histories/i,
    translate: () => ({
      message: "These two branches don't share any common history, so git won't merge them automatically.",
      hint: "This is unusual — it usually means one side was created independently (e.g. a fresh init instead of a clone) rather than actually being the same project.",
    }),
  },
  {
    test: /would be overwritten by (merge|checkout|rebase)/i,
    translate: (m) => ({
      message: `Your uncommitted changes would be overwritten by this ${m[1]}.`,
      hint: "Commit, stash, or discard those changes first, then try again.",
    }),
  },
  {
    test: /failed to push some refs/i,
    translate: () => ({
      message: "The remote has commits your local branch doesn't have — a plain push can't fast-forward.",
      hint: "Fetch (or pull) first, then push again.",
    }),
  },
  {
    test: /branch named ['"]?([^'"\s]+)['"]? already exists/i,
    translate: (m) => ({
      message: `A branch called "${m[1]}" already exists.`,
      hint: "Pick a different name, or check out the existing branch instead of creating a new one.",
    }),
  },
  {
    test: /is not fully merged/i,
    translate: () => ({
      message: "This branch has commits that aren't reachable from anywhere else.",
      hint: "Force delete if you're sure you don't need them — there's no undo for that.",
    }),
  },
  {
    test: /pathspec ['"]?([^'"\s]+)['"]? did not match/i,
    translate: (m) => ({
      message: `Git doesn't recognize "${m[1]}" as a branch, tag, or file in this repo.`,
      hint: "Double check the name — it may have been renamed, deleted, or never existed here.",
    }),
  },
  {
    test: /not a git repository/i,
    translate: () => ({
      message: "This folder isn't a git repository — there's no .git directory here.",
      hint: "If you moved or renamed the folder on disk, GitSplash may be pointing at a stale path — try removing and re-adding it.",
    }),
  },
  {
    test: /could not read Username|terminal prompts disabled|Authentication failed/i,
    translate: () => ({
      message: "Git tried to prompt for credentials, which isn't possible here.",
      hint: "This usually means the repo's account isn't set up correctly — check its SSH key is added on GitHub, or reassign the repo to the right account.",
    }),
  },
  {
    test: /you are not currently on a branch/i,
    translate: () => ({
      message: "You're in a detached HEAD state — not on any named branch.",
      hint: "Create a branch here first if you want to keep these commits, otherwise they can become hard to find later.",
    }),
  },
  {
    test: /No such file or directory/i,
    translate: () => ({
      message: "A file or folder this operation needed doesn't exist.",
      hint: "It may have been moved, renamed, or deleted outside GitSplash since it was last loaded — try refreshing.",
    }),
  },
  {
    test: /unable to create '([^']*index\.lock)'|Another git process seems to be running/i,
    translate: () => ({
      message: "Another git process is already running against this repo.",
      hint: "Wait for it to finish (a build, a terminal command, another GitSplash action) and try again. If nothing is actually running, a previous process may have crashed and left a stale index.lock file behind — deleting that file lets git proceed.",
    }),
  },
  {
    test: /reference does not exist|remote ref does not exist/i,
    translate: () => ({
      message: "Git tried to use a ref that doesn't exist — often a brief timing issue rather than a real problem.",
      hint: "This can happen if a branch was renamed or force-pushed on the remote right around when this ran. Try the same action again — it usually resolves itself on the next attempt.",
    }),
  },
  {
    test: /protected branch|GH006/i,
    translate: () => ({
      message: "The remote rejected this because the branch is protected.",
      hint: "Push to a different branch and open a pull request instead, or ask whoever manages the repo's branch protection rules for an exception.",
    }),
  },
  {
    test: /Repository not found/i,
    translate: () => ({
      message: "GitHub says this repository doesn't exist — or you don't have access to it.",
      hint: "Double-check the URL for typos, and make sure the account assigned to this repo actually has access (it may need to be a different account, or added as a collaborator).",
    }),
  },
  {
    test: /SSL certificate problem|certificate verify failed/i,
    translate: () => ({
      message: "Git couldn't verify the remote's SSL certificate.",
      hint: "This is common on corporate networks with a proxy that intercepts HTTPS — using SSH instead of HTTPS for this remote usually avoids it.",
    }),
  },
  {
    test: /src refspec .* does not match any/i,
    translate: () => ({
      message: "There's no local branch matching what this tried to push.",
      hint: "Double-check the branch name — it may be a typo, or the branch may need to be created (or committed to) first.",
    }),
  },
  {
    test: /cannot pull with rebase: You have unstaged changes|cannot rebase: You have unstaged changes/i,
    translate: () => ({
      message: "This rebase needs a clean working tree, but you have uncommitted changes.",
      hint: "Commit or stash those changes first, then try again.",
    }),
  },
  {
    test: /Repository does not exist|could not read Password/i,
    translate: () => ({
      message: "Git tried to authenticate over HTTPS and failed.",
      hint: "GitSplash prefers SSH — check this repo's account has \"Use SSH over HTTPS\" enabled in Settings, or that its SSH key is set up correctly.",
    }),
  },
];

/// Translates a raw git/gh error string into something a git beginner can
/// actually act on. Falls through to the original message unchanged for
/// anything not recognized, so nothing is ever hidden — only clarified.
export function translateGitError(raw: string): TranslatedError {
  for (const p of PATTERNS) {
    const match = raw.match(p.test);
    if (match) return p.translate(match);
  }
  return { message: raw };
}

/// Drop-in replacement for `reportGitError(e)` throughout the app —
/// same call shape, but runs the raw message through translateGitError
/// first so common failures explain themselves instead of just dumping
/// git's own stderr on someone still learning what that means.
export function reportGitError(e: unknown) {
  const { message, hint } = translateGitError(String(e));
  toast.error(message, hint ? { description: hint } : undefined);
}
