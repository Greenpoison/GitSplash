/// Stand-in for `@tauri-apps/plugin-updater` under `vite --mode mock` (see
/// vite.config.ts) — always reports no update available, so callers never
/// actually touch the returned value's shape.
export type Update = unknown;

export async function check(): Promise<Update | null> {
  return null;
}
