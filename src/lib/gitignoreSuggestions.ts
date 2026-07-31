export interface GitignoreRule {
  pattern: string;
  label: string;
  test: (path: string) => boolean;
}

/// Common categories of files that almost never belong in a commit — either
/// because they're huge and regenerable (dependencies, build output) or
/// because they can contain secrets (.env). Deliberately conservative: this
/// only flags things that are safe to suggest for virtually any project,
/// not project-specific judgment calls.
export const GITIGNORE_RULES: GitignoreRule[] = [
  { pattern: "node_modules/", label: "Node.js dependencies", test: (p) => p.includes("node_modules/") },
  { pattern: ".env", label: "environment/secret files", test: (p) => /(^|\/)\.env(\..+)?$/.test(p) },
  { pattern: "dist/", label: "build output", test: (p) => /(^|\/)dist\//.test(p) },
  { pattern: "build/", label: "build output", test: (p) => /(^|\/)build\//.test(p) },
  { pattern: "target/", label: "Rust build output", test: (p) => /(^|\/)target\//.test(p) },
  { pattern: "__pycache__/", label: "Python bytecode cache", test: (p) => p.includes("__pycache__/") },
  { pattern: "*.pyc", label: "Python bytecode files", test: (p) => p.endsWith(".pyc") },
  { pattern: ".DS_Store", label: "macOS Finder metadata", test: (p) => p.endsWith(".DS_Store") },
  { pattern: "*.log", label: "log files", test: (p) => p.endsWith(".log") },
  { pattern: "coverage/", label: "test coverage output", test: (p) => /(^|\/)coverage\//.test(p) },
  { pattern: ".idea/", label: "JetBrains IDE settings", test: (p) => p.includes(".idea/") },
];

export interface GitignoreSuggestion {
  pattern: string;
  label: string;
  /// Already committed — the "oops, this shouldn't be in git history at
  /// all" case. Fixing it needs both a .gitignore entry and untracking.
  trackedPaths: string[];
  /// Sitting in the working tree but never committed — just needs a
  /// .gitignore entry so it's not accidentally staged later.
  untrackedCount: number;
}

export function detectGitignoreSuggestions(
  trackedPaths: string[],
  workingTreePaths: string[],
  ignoredPatterns: Set<string>,
): GitignoreSuggestion[] {
  return GITIGNORE_RULES.filter((rule) => !ignoredPatterns.has(rule.pattern))
    .map((rule) => ({
      pattern: rule.pattern,
      label: rule.label,
      trackedPaths: trackedPaths.filter(rule.test),
      untrackedCount: workingTreePaths.filter(rule.test).length,
    }))
    .filter((s) => s.trackedPaths.length > 0 || s.untrackedCount > 0);
}
