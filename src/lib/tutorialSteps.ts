import type { View } from "@/store/appStore";

export interface TutorialStep {
  title: string;
  body: string;
  /** Switches the app to this view before showing the step, if set. */
  view?: View;
  /** CSS selector for the element to spotlight; omit to center the tip with no highlight. */
  target?: string;
  /** Shown instead of the target-specific body when the target isn't on screen (e.g. no repo added yet). */
  fallbackBody?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to GitSplash",
    body: "Quick tour — five steps to get you from zero to managing repos across multiple GitHub identities. Skip anytime.",
  },
  {
    title: "Add a GitHub account",
    body: "Start here. GitSplash generates a dedicated SSH identity for each account and routes every repo you assign to it through that identity automatically.",
    view: "settings",
    target: "[data-tutorial='add-account']",
  },
  {
    title: "Add a repo",
    body: "Add an existing local folder or clone one from a URL. GitSplash only ever tracks repos you explicitly add here.",
    view: "dashboard",
    target: "[data-tutorial='add-repo']",
  },
  {
    title: "Make a group",
    body: "Groups let you fetch/pull a whole set of repos at once — handy for related projects you always work on together.",
    view: "dashboard",
    target: "[data-tutorial='manage-groups']",
  },
  {
    title: "Group a repo",
    body: "Open this menu on any repo card and choose \"Edit groups\" to assign it to one or more groups.",
    fallbackBody: "Once you've added a repo, its card will show a ⋮ menu here — choose \"Edit groups\" from it to assign the repo to a group.",
    view: "dashboard",
    target: "[data-tutorial='repo-menu']",
  },
  {
    title: "Explore a repo",
    body: "Click any repo card to open it — changes, branches, pull requests, file history, an in-app editor, worktrees, submodules, and secret scanning all live in there.",
    fallbackBody: "Once you've added a repo, click its card to open changes, branches, pull requests, file history, an in-app editor, worktrees, submodules, and secret scanning.",
    view: "dashboard",
    target: "[data-tutorial='repo-card']",
  },
  {
    title: "That's it",
    body: "You can restart this tutorial anytime from Settings → General → Reset tutorial.",
  },
];
