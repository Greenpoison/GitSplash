export interface GroupColor {
  key: string;
  label: string;
  hex: string;
}

// Fixed hex values (not theme tokens) so a group's color reads the same
// regardless of light/dark mode — it's an identity marker, not chrome.
export const GROUP_COLORS: GroupColor[] = [
  { key: "red", label: "Red", hex: "#ef4444" },
  { key: "orange", label: "Orange", hex: "#f97316" },
  { key: "amber", label: "Amber", hex: "#f59e0b" },
  { key: "green", label: "Green", hex: "#22c55e" },
  { key: "teal", label: "Teal", hex: "#14b8a6" },
  { key: "blue", label: "Blue", hex: "#3b82f6" },
  { key: "indigo", label: "Indigo", hex: "#6366f1" },
  { key: "purple", label: "Purple", hex: "#a855f7" },
  { key: "pink", label: "Pink", hex: "#ec4899" },
];

export function groupColorHex(key: string | null | undefined): string | null {
  if (!key) return null;
  return GROUP_COLORS.find((c) => c.key === key)?.hex ?? null;
}
