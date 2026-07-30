import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SecretsPanel } from "@/components/repos/SecretsPanel";
import { useAppStore } from "@/store/appStore";

export function SecretsPage() {
  const repos = useAppStore((s) => s.repos);
  const [selectedId, setSelectedId] = useState("");

  const selected = repos.find((r) => r.id === selectedId) ?? repos[0];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Secrets</h1>
        {repos.length > 0 && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose a repo…" />
            </SelectTrigger>
            <SelectContent>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No repos tracked yet — add one from the Dashboard first.
        </p>
      ) : selected ? (
        <SecretsPanel repo={selected} />
      ) : (
        <p className="text-sm text-muted-foreground">Choose a repo above to scan it.</p>
      )}
    </div>
  );
}
