"use client";

import { useRelatedContent } from "@/hooks/use-notes";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  FileText,
  Globe,
  ExternalLink,
  Loader2,
  Video,
  Newspaper,
} from "lucide-react";
import Link from "next/link";

interface RelatedContentProps {
  noteId: string;
  enrichmentStatus: string | null;
}

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "video":
      return <Video className="size-4 text-red-500" />;
    case "article":
      return <Newspaper className="size-4 text-blue-500" />;
    default:
      return <Globe className="size-4 text-muted-foreground" />;
  }
}

export function RelatedContent({
  noteId,
  enrichmentStatus: initialStatus,
}: RelatedContentProps) {
  const shouldPoll =
    initialStatus === "pending" || initialStatus === "processing";
  const { enrichmentStatus, relatedNotes, webContent, isLoading } =
    useRelatedContent(noteId, shouldPoll);

  const status = enrichmentStatus || initialStatus;
  const isPending = status === "pending" || status === "processing";

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Related Content</h3>
        {isPending && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin text-amber-800" />
            Analyzing...
          </div>
        )}
      </div>

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">
            <FileText className="size-3.5" />
            Notes ({relatedNotes.length})
          </TabsTrigger>
          <TabsTrigger value="web">
            <Globe className="size-3.5" />
            Web ({webContent.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-3 space-y-2">
          {relatedNotes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {isPending
                ? "Finding related notes..."
                : "No related notes found"}
            </p>
          ) : (
            relatedNotes.map(
              (rn: {
                id: string;
                relatedNoteId: string;
                title: string;
                content: string;
                similarityScore: number;
              }) => (
                <Link key={rn.id} href={`/notes/${rn.relatedNoteId}`}>
                  <Card
                    size="sm"
                    className="transition-colors hover:bg-muted/50"
                  >
                    <CardHeader>
                      <CardTitle className="line-clamp-1 text-sm">
                        {rn.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {rn.content.slice(0, 100)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              )
            )
          )}
        </TabsContent>

        <TabsContent value="web" className="mt-3 space-y-2">
          {webContent.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {isPending
                ? "Searching the web..."
                : "No web content found"}
            </p>
          ) : (
            webContent.map(
              (wc: {
                id: string;
                url: string;
                title: string | null;
                description: string | null;
                thumbnailUrl: string | null;
                contentType: string | null;
                relevanceReason: string | null;
              }) => {
                let keyword = wc.title || "";
                let description = wc.relevanceReason || wc.title || "";
                try {
                  if (wc.relevanceReason) {
                    const parsed = JSON.parse(wc.relevanceReason);
                    if (parsed.keyword) keyword = parsed.keyword;
                    if (parsed.description) description = parsed.description;
                  }
                } catch {
                  // relevanceReason is plain text, use as-is
                }

                return (
                  <Card
                    key={wc.id}
                    size="sm"
                    className="transition-colors hover:bg-muted/50"
                  >
                    <CardContent>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ContentTypeIcon type={wc.contentType || "webpage"} />
                            <p className="text-sm font-medium text-foreground">
                              {keyword}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <a
                                href={wc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            }
                          />
                          <TooltipContent side="left" className="max-w-xs space-y-1.5 rounded-lg bg-black p-3 text-white">
                            <p className="text-xs font-medium text-white">{wc.title}</p>
                            {wc.description && (
                              <p className="text-xs text-white/70">
                                {wc.description.slice(0, 200)}
                              </p>
                            )}
                            {wc.thumbnailUrl && (
                              <img
                                src={wc.thumbnailUrl}
                                alt=""
                                className="mt-1 h-24 w-full rounded object-cover"
                              />
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
