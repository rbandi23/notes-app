"use client";

import { use, useEffect, useState } from "react";
import { NoteEditor } from "@/components/notes/NoteEditor";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Globe, ExternalLink, Video, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "@/lib/date";

interface SharedData {
  note: {
    id: string;
    title: string;
    content: string;
    contentJson: unknown;
    tags: string[] | null;
    createdAt: string;
  };
  author: { name: string | null; image: string | null };
  webContent: Array<{
    id: string;
    url: string;
    title: string | null;
    description: string | null;
    contentType: string | null;
    relevanceReason: string | null;
  }>;
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
  ];
  return colors[Math.abs(hash) % colors.length];
}

export default function SharedNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        This note is not available or has been unshared.
      </div>
    );
  }

  const { note, author, webContent } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{note.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          By {author?.name || "Anonymous"} &middot;{" "}
          {formatDistanceToNow(note.createdAt)}
        </p>
      </div>

      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
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
          <NoteEditor content={note.contentJson as Record<string, unknown>} editable={false} />
        ) : (
          <p className="whitespace-pre-wrap">{note.content}</p>
        )}
      </div>

      {webContent.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Related Resources</h2>
            {webContent.map((wc) => (
              <a
                key={wc.id}
                href={wc.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Card
                  size="sm"
                  className="transition-colors hover:bg-muted/50"
                >
                  <CardHeader>
                    <CardTitle className="line-clamp-1 text-sm">
                      {wc.contentType === "video" ? (
                        <Video className="mr-1 inline size-4 text-red-500" />
                      ) : (
                        <Newspaper className="mr-1 inline size-4 text-blue-500" />
                      )}
                      {wc.title}
                      <ExternalLink className="ml-1 inline size-3" />
                    </CardTitle>
                  </CardHeader>
                  {wc.relevanceReason && (
                    <CardContent>
                      <p className="text-xs italic text-primary/80">
                        {wc.relevanceReason}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </a>
            ))}
          </div>
        </>
      )}

      <Separator />
      <p className="text-center text-xs text-muted-foreground">
        Shared via Continuum Notes
      </p>
    </div>
  );
}
