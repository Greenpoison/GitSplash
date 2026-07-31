import { Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { nextTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme(resolvedTheme))}
      aria-label={`Switch theme (currently ${resolvedTheme ?? "light"})`}
    >
      {resolvedTheme === "dark" ? (
        <Moon className="size-4" />
      ) : resolvedTheme === "dim" ? (
        <Contrast className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </Button>
  );
}
