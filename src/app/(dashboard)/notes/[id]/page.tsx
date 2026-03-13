"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useNote, deleteNote } from "@/hooks/use-notes";
import { RelatedContent } from "@/components/notes/RelatedContent";
import { ShareDialog } from "@/components/notes/ShareDialog";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/lib/date";

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { note, relatedNotes, webContent, isLoading, mutate } = useNote(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function tagColor(tag: string): string {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
      "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
      "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
    ];
    return colors[Math.abs(hash) % colors.length];
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this note?")) return;
    setDeleting(true);
    try {
      await deleteNote(id);
      toast.success("Note deleted");
      router.push("/notes");
    } catch {
      toast.error("Failed to delete note");
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
        <p>Note not found</p>
        <Link href="/notes">
          <Button variant="outline">Back to Notes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" />
            Share
          </Button>
          <Link href={`/notes/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="size-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {note.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Updated {formatDistanceToNow(note.updatedAt)}
            </p>
          </div>

          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((tag: string) => (
                <span
                  key={tag}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tagColor(tag)}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <Separator />

          <div className="prose prose-sm dark:prose-invert max-w-none">
            {note.contentJson ? (
              <NoteEditor content={note.contentJson} editable={false} />
            ) : (
              <p className="whitespace-pre-wrap">{note.content}</p>
            )}
          </div>
        </div>

        <Separator />

        <RelatedContent
          noteId={id}
          enrichmentStatus={note.enrichmentStatus}
        />
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        noteId={id}
        isPublic={note.isPublic}
        shareToken={note.shareToken}
        onShareChange={() => mutate()}
      />
    </div>
  );
}
