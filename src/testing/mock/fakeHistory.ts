import type { BranchInfo, CommitNode, CompareFile, TagInfo } from "@/lib/types";

const AUTHORS = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Margaret Hamilton"];
const FILE_POOL = [
  "src/index.ts",
  "src/app.tsx",
  "src/utils/helpers.ts",
  "src/components/Button.tsx",
  "src/components/Modal.tsx",
  "README.md",
  "package.json",
];
const SUBJECTS = [
  "Fix off-by-one in pagination",
  "Add dark mode toggle",
  "Refactor auth middleware",
  "Improve error messages",
  "Bump dependency versions",
  "Add unit tests for parser",
  "Fix flaky CI test",
  "Optimize database query",
  "Update README",
  "Handle edge case in validator",
  "Tidy up unused imports",
  "Add loading skeletons",
];

/// Deterministic hex string that looks like a git hash — uniqueness (via
/// `seed`) is all that matters here, not real randomness.
function fakeHash(seed: number): string {
  let x = (seed * 2654435761) % 4294967296;
  let hex = "";
  for (let i = 0; i < 40; i++) {
    x = (x * 1103515245 + 12345) % 4294967296;
    hex += Math.abs(Math.floor(x / 65536) % 16).toString(16);
  }
  return hex;
}

export interface FakeHistory {
  commits: CommitNode[];
  branches: BranchInfo[];
  tags: TagInfo[];
  filesByHash: Map<string, CompareFile[]>;
}

/// A small, deterministic set of "changed files" for a commit — enough
/// overlap across the pool that at least one file's history typically spans
/// both the mainline and the open feature branch, which is exactly the case
/// worth exercising for cross-branch file tracking.
function filesForCommit(seed: number): CompareFile[] {
  const count = 1 + (seed % 3);
  const files: CompareFile[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    // 11 and 13 are both coprime with FILE_POOL.length (7) — using a
    // multiplier that shared a factor with it (7 itself, notably) made
    // `seed`'s contribution vanish entirely under the modulo, so every
    // commit picked the exact same files regardless of which commit it was.
    const idx = (seed * 11 + i * 13) % FILE_POOL.length;
    if (used.has(idx)) continue;
    used.add(idx);
    files.push({
      path: FILE_POOL[idx],
      origPath: null,
      status: "modified",
      insertions: 1 + (seed % 20),
      deletions: seed % 10,
    });
  }
  return files;
}

/// Builds a small but structurally realistic history: a mainline, a merged
/// feature branch, a still-open feature branch, and a few version tags —
/// enough shape to exercise branch coloring, merge rendering, and lineage
/// tracing without needing a real repo. `seed` varies the generated commits
/// per mock repo so they don't all look identical.
export function generateFakeHistory(seed: number): FakeHistory {
  const commits: CommitNode[] = [];
  let day = 0;
  const dateFor = () => {
    day += 1;
    const d = new Date(2025, 0, 1);
    d.setDate(d.getDate() + day);
    return d.toISOString();
  };

  let hashCounter = seed * 1000;
  const newHash = () => fakeHash(++hashCounter);
  const pick = <T,>(arr: T[], i: number): T => arr[(i + seed) % arr.length];
  const filesByHash = new Map<string, CompareFile[]>();

  function addCommit(parents: string[], subject: string): string {
    const hash = newHash();
    commits.push({ hash, parents, refs: [], subject, body: "", author: pick(AUTHORS, hashCounter), date: dateFor() });
    filesByHash.set(hash, filesForCommit(hashCounter));
    return hash;
  }

  let mainTip = addCommit([], "Initial commit");
  for (let i = 0; i < 15; i++) mainTip = addCommit([mainTip], pick(SUBJECTS, i));
  const v010 = mainTip;

  let alphaTip = mainTip;
  for (let i = 0; i < 8; i++) alphaTip = addCommit([alphaTip], `alpha: ${pick(SUBJECTS, i + 3)}`);
  for (let i = 0; i < 10; i++) mainTip = addCommit([mainTip], pick(SUBJECTS, i + 1));
  mainTip = addCommit([mainTip, alphaTip], "Merge branch 'feature/alpha'");
  const v020 = mainTip;

  let betaTip = mainTip;
  for (let i = 0; i < 6; i++) betaTip = addCommit([betaTip], `beta: ${pick(SUBJECTS, i + 5)}`);

  for (let i = 0; i < 12; i++) mainTip = addCommit([mainTip], pick(SUBJECTS, i + 2));
  const v030 = mainTip;

  for (let i = 0; i < 8; i++) mainTip = addCommit([mainTip], pick(SUBJECTS, i + 4));

  const byHash = new Map(commits.map((c) => [c.hash, c]));
  byHash.get(mainTip)!.refs.push("HEAD -> main");
  byHash.get(betaTip)!.refs.push("feature/beta");
  byHash.get(v010)!.refs.push("v0.1.0");
  byHash.get(v020)!.refs.push("v0.2.0");
  byHash.get(v030)!.refs.push("v0.3.0");

  const branches: BranchInfo[] = [
    { name: "main", isCurrent: true, upstream: "origin/main", isMerged: false, isGone: false, isRemote: false },
    { name: "feature/beta", isCurrent: false, upstream: null, isMerged: false, isGone: false, isRemote: false },
  ];

  const tags: TagInfo[] = [
    { name: "v0.1.0", hash: v010, isAnnotated: false, message: null, tagger: null, date: null },
    { name: "v0.2.0", hash: v020, isAnnotated: false, message: null, tagger: null, date: null },
    { name: "v0.3.0", hash: v030, isAnnotated: false, message: null, tagger: null, date: null },
  ];

  // `git log` order — newest first — since that's what every real command
  // returns and what the app's own layout/segment logic assumes.
  commits.reverse();

  return { commits, branches, tags, filesByHash };
}
