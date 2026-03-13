"use client";

import { useState, useCallback } from "react";
import { NoteList } from "@/components/notes/NoteList";
import { NoteSearch } from "@/components/notes/NoteSearch";
import { NoteGraph } from "@/components/notes/NoteGraph";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircle, List, Network } from "lucide-react";

export default function NotesPage() {
  const [searchActive, setSearchActive] = useState(false);
  const [view, setView] = useState<"list" | "graph">("list");
  const handleActiveChange = useCallback((active: boolean) => {
    setSearchActive(active);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={view === "graph" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("graph")}
            >
              <Network className="size-4" />
            </Button>
          </div>
          <Link href="/notes/new">
            <Button>
              <PlusCircle className="size-4" />
              New Note
            </Button>
          </Link>
        </div>
      </div>
      {view === "graph" ? (
        <NoteGraph />
      ) : (
        <>
          <NoteSearch onActiveChange={handleActiveChange} />
          {!searchActive && <NoteList />}
        </>
      )}
    </div>
  );
}
