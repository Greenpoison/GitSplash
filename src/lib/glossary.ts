export interface GlossaryEntry {
  term: string;
  definition: string;
}

/// Plain-English definitions for the git terms this app's own UI uses most —
/// a quick lookup for anyone who's only ever done branch → push → PR → merge
/// and runs into a word GitSplash (or a teammate) uses in passing.
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Branch",
    definition: "A separate line of commits you can work on without affecting other branches — usually created so a feature or fix can be reviewed on its own before joining the main line of work.",
  },
  {
    term: "Commit",
    definition: "A saved snapshot of your changes, with a message describing what changed and why. Commits build on top of each other to form a branch's history.",
  },
  {
    term: "Merge",
    definition: "Bringing one branch's commits into another. If the branches haven't diverged, this can \"fast-forward\" with no extra commit; otherwise it creates a merge commit joining both histories.",
  },
  {
    term: "Fast-forward",
    definition: "When merging is as simple as moving a branch pointer forward, because the target branch has no commits the other branch doesn't already have. No merge commit is created — which also means no record is kept that a merge happened.",
  },
  {
    term: "Pull request (PR)",
    definition: "A request on GitHub (or similar) to merge one branch into another, opened for review and discussion before the merge actually happens. Not a git concept itself — it's a feature of the hosting service.",
  },
  {
    term: "Push",
    definition: "Uploads your local commits to the remote (e.g. GitHub) so others — and GitHub itself, for opening a PR — can see them.",
  },
  {
    term: "Pull",
    definition: "Downloads commits from the remote and merges them into your current branch — effectively a fetch followed by a merge.",
  },
  {
    term: "Fetch",
    definition: "Downloads the latest commits and branches from the remote without changing anything in your working copy — safe to run any time.",
  },
  {
    term: "Upstream",
    definition: "The remote branch a local branch is linked to for push/pull — e.g. your local \"main\" tracking \"origin/main\". A brand new branch has no upstream until you push it once.",
  },
  {
    term: "Origin",
    definition: "The default name git gives to the remote a repo was cloned from. Not special or hardcoded — just a convention.",
  },
  {
    term: "HEAD",
    definition: "A pointer to whatever commit you currently have checked out — normally the tip of your current branch.",
  },
  {
    term: "Detached HEAD",
    definition: "When HEAD points directly at a commit instead of at a branch. You can still look around and even commit, but those commits won't belong to any branch unless you create one before switching away.",
  },
  {
    term: "Rebase",
    definition: "Replays your branch's commits on top of a different starting point, producing new commits with the same changes but different history — useful for keeping history linear, but it rewrites commits, which is risky on anything already shared/pushed.",
  },
  {
    term: "Cherry-pick",
    definition: "Copies one specific commit from another branch onto your current branch, without bringing along everything else on that branch.",
  },
  {
    term: "Stash",
    definition: "Temporarily sets aside uncommitted changes so your working tree is clean (e.g. to pull or switch branches), without having to commit them. Pop it back later to pick up where you left off.",
  },
  {
    term: "Reflog",
    definition: "A local log of everywhere HEAD has pointed recently — including commits from branches you've since deleted or reset away. Often the way back after \"I think I lost my work.\"",
  },
  {
    term: "Conflict",
    definition: "Happens when a merge, rebase, or cherry-pick touches the same lines two different ways and git can't decide which to keep automatically — resolving it means picking (or combining) the right result by hand.",
  },
  {
    term: "Force push",
    definition: "Pushes even though the remote has commits your branch doesn't (normally a safety check that blocks the push). Can overwrite others' work if you're not careful — \"force-with-lease\" is the safer version, which fails instead if someone else pushed since your last fetch.",
  },
  {
    term: "Amend",
    definition: "Replaces your most recent commit with a new one (different message and/or contents) instead of adding another commit on top. Rewrites history, so avoid it on commits you've already pushed and shared.",
  },
  {
    term: "Squash",
    definition: "Combines multiple commits into one, usually to tidy up a messy work-in-progress history before it's merged.",
  },
  {
    term: "Tag",
    definition: "A permanent, named pointer to a specific commit — commonly used to mark releases (e.g. \"v1.0.0\"). Unlike a branch, a tag doesn't move as new commits are added.",
  },
  {
    term: ".gitignore",
    definition: "A file listing patterns for what git should never track — build output, dependencies, editor files — so they don't show up as \"changes\" or get accidentally committed.",
  },
  {
    term: "Worktree",
    definition: "A second working directory for the same repo, checked out to a different branch at the same time — lets you work on two branches side by side without stashing or switching back and forth.",
  },
  {
    term: "Submodule",
    definition: "A git repository embedded inside another one, pinned to a specific commit — used to include another project as a dependency while keeping its own history separate.",
  },
];

/// Matches on the term itself or its definition, so searching a word you
/// only vaguely remember ("undo", "history") can still surface the right
/// entry even if it's not the term's own name.
export function searchGlossary(query: string, entries: GlossaryEntry[] = GLOSSARY): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q),
  );
}
