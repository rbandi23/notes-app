"use client";

import { useState, useEffect } from "react";
import { useSearchNotes, deleteNote } from "@/hooks/use-notes";
import { NoteCard } from "./NoteCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";

interface NoteSearchProps {
  onActiveChange?: (active: boolean) => void;
}

export function NoteSearch({ onActiveChange }: NoteSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [searchImages, setSearchImages] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(inputValue);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const isActive = query.trim().length > 0;
  const { notes, pagination, isLoading, mutate } = useSearchNotes(query, page, 20, searchImages);

  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  async function handleDelete(id: string) {
    // Optimistic delete: remove from cache immediately
    mutate(
      (current: { notes: Array<{ id: string }>; pagination: typeof pagination } | undefined) => current ? {
        ...current,
        notes: current.notes.filter((n) => n.id !== id),
      } : current,
      { revalidate: false }
    );
    try {
      await deleteNote(id);
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
      mutate(); // revert on error
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={searchImages ? "Search by image content..." : "Search notes..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="pl-9"
          />
          {inputValue && (
            <button
              onClick={() => setInputValue("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center rounded-lg border p-0.5">
          <Button
            variant={!searchImages ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setSearchImages(false); setPage(1); }}
            title="Search notes"
          >
            <FileText className="size-4" />
          </Button>
          <Button
            variant={searchImages ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setSearchImages(true); setPage(1); }}
            title="Search by images"
          >
            <ImageIcon className="size-4" />
          </Button>
        </div>
      </div>
      {isActive && (
        <>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No results found
            </p>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}
