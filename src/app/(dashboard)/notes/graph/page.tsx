"use client";

import { NoteGraph } from "@/components/notes/NoteGraph";

export default function GraphPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Knowledge Graph
        </h1>
        <p className="text-sm text-muted-foreground">
          Visual map of how your notes relate to each other. Click a node to
          open that note.
        </p>
      </div>
      <NoteGraph />
    </div>
  );
}
