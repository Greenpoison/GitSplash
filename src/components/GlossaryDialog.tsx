import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/store/appStore";
import { searchGlossary } from "@/lib/glossary";

export function GlossaryDialog() {
  const open = useAppStore((s) => s.glossaryOpen);
  const setOpen = useAppStore((s) => s.setGlossaryOpen);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchGlossary(query), [query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle>Git glossary</DialogTitle>
          <DialogDescription>Plain-English definitions for terms used around the app.</DialogDescription>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms…"
            className="pl-7"
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 pr-3">
            {results.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No matching terms.</p>
            ) : (
              results.map((entry) => (
                <div key={entry.term}>
                  <div className="text-sm font-semibold">{entry.term}</div>
                  <p className="text-xs text-muted-foreground">{entry.definition}</p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
