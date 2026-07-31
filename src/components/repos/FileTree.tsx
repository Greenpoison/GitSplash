import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, File, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: Node[];
}
interface FileNode {
  type: "file";
  name: string;
  path: string;
}
type Node = DirNode | FileNode;

function buildTree(paths: string[]): DirNode {
  const root: DirNode = { type: "dir", name: "", path: "", children: [] };
  const dirIndex = new Map<string, DirNode>([["", root]]);

  for (const path of paths) {
    const parts = path.split("/");
    let parentPath = "";
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
      let dir = dirIndex.get(segPath);
      if (!dir) {
        dir = { type: "dir", name: parts[i], path: segPath, children: [] };
        dirIndex.set(segPath, dir);
        parent.children.push(dir);
      }
      parent = dir;
      parentPath = segPath;
    }
    parent.children.push({ type: "file", name: parts[parts.length - 1], path });
  }

  const sortChildren = (dir: DirNode) => {
    dir.children.sort((a, b) =>
      a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
    );
    for (const child of dir.children) {
      if (child.type === "dir") sortChildren(child);
    }
  };
  sortChildren(root);
  return root;
}

function collectDirPaths(node: DirNode, out: Set<string>) {
  for (const child of node.children) {
    if (child.type === "dir") {
      out.add(child.path);
      collectDirPaths(child, out);
    }
  }
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  isExpanded,
  toggle,
  renderBadge,
}: {
  node: Node;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  isExpanded: (path: string) => boolean;
  toggle: (path: string) => void;
  renderBadge?: (path: string) => ReactNode;
}) {
  const pad = 8 + depth * 14;

  if (node.type === "file") {
    return (
      <button
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: pad }}
        title={node.path}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded-md py-1 pr-2 text-left font-mono text-xs",
          selected === node.path ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <File className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
        {renderBadge?.(node.path)}
      </button>
    );
  }

  const open = isExpanded(node.path);
  return (
    <div>
      <button
        onClick={() => toggle(node.path)}
        style={{ paddingLeft: pad }}
        className="flex w-full items-center gap-1 truncate rounded-md py-1 pr-2 text-left text-xs font-medium hover:bg-accent/50"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            isExpanded={isExpanded}
            toggle={toggle}
            renderBadge={renderBadge}
          />
        ))}
    </div>
  );
}

/// Renders a flat list of repo-relative file paths as a collapsible folder
/// tree instead of a flat list of full paths. Folders start collapsed (an
/// empty `expandedDirs` set reads as "nothing expanded yet") with Expand
/// all/Collapse all controls to jump between the two; while `query` filters
/// the list, every folder force-expands so matches are never hidden behind
/// a folder collapsed from before the search started.
export function FileTree({
  files,
  query,
  selected,
  onSelect,
  renderBadge,
}: {
  files: string[];
  query: string;
  selected: string | null;
  onSelect: (path: string) => void;
  renderBadge?: (path: string) => ReactNode;
}) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? files.filter((f) => f.toLowerCase().includes(q)) : files),
    [files, q],
  );
  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const allDirPaths = useMemo(() => {
    const set = new Set<string>();
    collectDirPaths(tree, set);
    return set;
  }, [tree]);

  const isExpanded = (path: string) => !!q || expandedDirs.has(path);
  const toggle = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => setExpandedDirs(new Set(allDirPaths))}
          disabled={allDirPaths.size === 0}
        >
          <ChevronsDown className="size-3" /> Expand all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => setExpandedDirs(new Set())}
          disabled={allDirPaths.size === 0}
        >
          <ChevronsUp className="size-3" /> Collapse all
        </Button>
      </div>
      <ScrollArea className="gradient-border flex-1 rounded-md bg-card">
        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No files match.</p>
        ) : (
          <div className="flex flex-col p-1">
            {tree.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={0}
                selected={selected}
                onSelect={onSelect}
                isExpanded={isExpanded}
                toggle={toggle}
                renderBadge={renderBadge}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
