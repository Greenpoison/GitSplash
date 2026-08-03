/// Stand-in for `@tauri-apps/plugin-dialog` under `vite --mode mock` (see
/// vite.config.ts) — a real native file/folder picker can't be driven from
/// a plain browser tab, so these just hand back a fixed fake path instead
/// of prompting, letting flows that need "some path was chosen" proceed.
export async function open(_options?: unknown): Promise<string | null> {
  return "C:/mock/projects/new-repo";
}

export async function save(_options?: unknown): Promise<string | null> {
  return "C:/mock/exported-secrets.zip";
}
