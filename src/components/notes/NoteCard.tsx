"use client";

import React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";

interface NoteCardProps {
  note: {
    id: string;
    title: string;
    content: string;
    tags: string[] | null;
    enrichmentStatus: string | null;
    updatedAt: string;
  };
  onDelete?: (id: string) => void;
}

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

function EnrichmentIcon({ status }: { status: string | null }) {
  switch (status) {
    case "processing":
    case "pending":
      return <Loader2 className="size-3.5 animate-spin text-amber-800" />;
    case "completed":
      return <CheckCircle2 className="size-3.5 text-green-600" />;
    case "failed":
      return <AlertCircle className="size-3.5 text-destructive" />;
    default:
      return null;
  }
}

export const NoteCard = React.memo(function NoteCard({ note, onDelete }: NoteCardProps) {
  const preview =
    note.content.length > 120
      ? note.content.slice(0, 120) + "..."
      : note.content;

  return (
    <Link href={`/notes/${note.id}`}>
      <Card className="h-full transition-shadow hover:shadow-md" size="sm">
        <CardHeader>
          <CardTitle className="line-clamp-1">{note.title}</CardTitle>
          <CardAction>
            <div className="flex items-center gap-1">
              <EnrichmentIcon status={note.enrichmentStatus} />
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm("Delete this note?")) onDelete(note.id);
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </CardAction>
          <CardDescription>
            {formatDistanceToNow(note.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {preview || "Empty note"}
          </p>
          {note.tags && note.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tagColor(tag)}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
});
