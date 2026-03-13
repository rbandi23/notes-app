"use client";

import { useState } from "react";
import { useNotes, deleteNote } from "@/hooks/use-notes";
import { NoteCard } from "./NoteCard";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NoteList() {
  const [page, setPage] = useState(1);
  const { notes, pagination, isLoading, isError, mutate } = useNotes(page);

  async function handleDelete(id: string) {
    try {
      await deleteNote(id);
      toast.success("Note deleted");
      mutate();
    } catch {
      toast.error("Failed to delete note");
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <p>Failed to load notes.</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
        <FileText className="size-12 stroke-1" />
        <p className="text-lg font-medium">No notes yet</p>
        <p className="text-sm">Create your first note to get started.</p>
        <Link href="/notes/new">
          <Button>Create Note</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((note: { id: string; title: string; content: string; tags: string[] | null; enrichmentStatus: string | null; updatedAt: string }) => (
          <NoteCard key={note.id} note={note} onDelete={handleDelete} />
        ))}
      </div>
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
