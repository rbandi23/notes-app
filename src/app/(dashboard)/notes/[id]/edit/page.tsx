"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNote, updateNote } from "@/hooks/use-notes";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Check, Cloud } from "lucide-react";
import { toast } from "sonner";

const AUTOSAVE_DELAY = 1500; // ms after last keystroke

export default function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { note, isLoading, mutate } = useNote(id);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentJson, setContentJson] = useState<unknown>(null);
  const [initialized, setInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "error"
  >("saved");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title: "", content: "", contentJson: null as unknown });

  useEffect(() => {
    if (note && !initialized) {
      setTitle(note.title);
      setContent(note.content);
      setContentJson(note.contentJson);
      latestRef.current = {
        title: note.title,
        content: note.content,
        contentJson: note.contentJson,
      };
      setInitialized(true);
    }
  }, [note, initialized]);

  const save = useCallback(async () => {
    const { title: t, content: c, contentJson: cj } = latestRef.current;
    if (!t.trim()) return;
    setSaveStatus("saving");
    try {
      await updateNote(id, { title: t, content: c, contentJson: cj });
      setSaveStatus("saved");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutate((prev: any) =>
        prev ? { ...prev, note: { ...prev.note, title: t, content: c, contentJson: cj } } : prev,
        { revalidate: false }
      );
    } catch {
      setSaveStatus("error");
      toast.error("Failed to save");
    }
  }, [id, mutate]);

  const scheduleSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(), AUTOSAVE_DELAY);
  }, [save]);

  // Save on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Fire save synchronously on unmount isn't possible,
        // but we can try to flush it
        save();
      }
    };
  }, [save]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    latestRef.current.title = e.target.value;
    scheduleSave();
  }

  function handleEditorChange(json: unknown, text: string) {
    setContentJson(json);
    setContent(text);
    latestRef.current.contentJson = json;
    latestRef.current.content = text;
    scheduleSave();
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="size-4 animate-spin text-amber-800" />
              Saving...
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Cloud className="size-4" />
              Saved
            </>
          )}
          {saveStatus === "unsaved" && (
            <>
              <div className="size-2 rounded-full bg-amber-500" />
              Editing...
            </>
          )}
          {saveStatus === "error" && (
            <>
              <div className="size-2 rounded-full bg-destructive" />
              Save failed
            </>
          )}
        </div>
      </div>
      <Input
        placeholder="Note title..."
        value={title}
        onChange={handleTitleChange}
        className="border-none text-2xl font-semibold shadow-none focus-visible:ring-0"
      />
      {initialized && (
        <NoteEditor
          content={note.contentJson || note.content}
          onChange={handleEditorChange}
          noteId={id}
        />
      )}
    </div>
  );
}
