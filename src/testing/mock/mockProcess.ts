/// Stand-in for `@tauri-apps/plugin-process` under `vite --mode mock` (see
/// vite.config.ts) — there's no real process to relaunch in a browser tab.
export async function relaunch(): Promise<void> {
  console.warn("[mock-tauri] relaunch() called — no-op in mock mode");
}
