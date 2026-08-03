/// Stand-in for `@tauri-apps/api/event` under `vite --mode mock` (see
/// vite.config.ts) — the mock backend never actually emits anything, so
/// listening is a permanent no-op rather than a real subscription.
export async function listen<T>(_event: string, _handler: (e: { payload: T }) => void): Promise<() => void> {
  return () => {};
}
