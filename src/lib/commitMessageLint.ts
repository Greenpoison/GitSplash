export interface CommitMessageTip {
  text: string;
}

/// Messages that don't say anything about what actually changed — the
/// classic beginner habit that makes `git log` useless six months later.
const VAGUE_SUBJECTS = new Set([
  "fix", "fixes", "fixed", "update", "updates", "updated", "wip", "stuff",
  "changes", "misc", "asdf", "test", "temp", "tmp", ".", "commit", "done",
  "more changes", "small fix", "minor fix",
]);

/// Common past-tense first words → the imperative form convention (Tim
/// Pope's git commit guide: "if applied, this commit will ___").
const IMPERATIVE_FORM: Record<string, string> = {
  fixed: "fix",
  added: "add",
  updated: "update",
  removed: "remove",
  changed: "change",
  refactored: "refactor",
  renamed: "rename",
  deleted: "delete",
  created: "create",
  moved: "move",
  improved: "improve",
  implemented: "implement",
};

/// Purely advisory — never blocks committing, and none of this is
/// enforced. The goal is teaching the handful of widely-used conventions
/// (imperative mood, a concise subject, blank line before a body) that
/// make a project's history actually useful, not gatekeeping.
export function lintCommitMessage(message: string): CommitMessageTip[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  const subject = lines[0].trim();
  const tips: CommitMessageTip[] = [];

  if (VAGUE_SUBJECTS.has(subject.toLowerCase())) {
    tips.push({
      text: `"${subject}" doesn't say what changed — anyone reading the log later (including you) has to open the diff to find out.`,
    });
  }

  if (subject.length > 72) {
    tips.push({
      text: `First line is ${subject.length} characters — keeping it under ~50-72 avoids truncation in git log and GitHub's UI.`,
    });
  }

  if (/[.!]$/.test(subject)) {
    tips.push({ text: "Convention is no period at the end of the subject line." });
  }

  const firstWord = subject.split(/\s+/)[0]?.toLowerCase();
  const imperative = firstWord ? IMPERATIVE_FORM[firstWord] : undefined;
  if (imperative) {
    tips.push({
      text: `Try imperative mood — "${imperative}" instead of "${firstWord}". Think of it as completing "this commit will ___".`,
    });
  }

  if (lines.length > 1 && lines[1].trim() !== "") {
    tips.push({ text: "Leave a blank line between the subject and any additional detail below it." });
  }

  return tips;
}
