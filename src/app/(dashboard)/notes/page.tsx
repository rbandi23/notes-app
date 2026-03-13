"use client";

import { Suspense, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NoteList } from "@/components/notes/NoteList";
import { NoteSearch } from "@/components/notes/NoteSearch";
import { NoteGraph } from "@/components/notes/NoteGraph";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, List, Network } from "lucide-react";

function NotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchActive, setSearchActive] = useState(false);
  const view = searchParams.get("view") === "graph" ? "graph" : "list";

  function setView(v: "list" | "graph") {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "graph") {
      params.set("view", "graph");
    } else {
      params.delete("view");
    }
    router.replace(`/notes?${params.toString()}`, { scroll: false });
  }

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

export default function NotesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <NotesContent />
    </Suspense>
  );
}
