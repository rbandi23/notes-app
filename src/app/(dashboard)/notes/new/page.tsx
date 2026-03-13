"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { createNote } from "@/hooks/use-notes";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function NewNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentJson, setContentJson] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() && !content.trim()) {
      toast.error("Title or content is required");
      return;
    }
    setSaving(true);
    try {
      const note = await createNote({ title, content, contentJson });
      toast.success("Note created");
      router.push(`/notes/${note.id}`);
    } catch {
      toast.error("Failed to create note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/notes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Note"}
        </Button>
      </div>
      <Input
        placeholder="Note title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border-none text-2xl font-semibold shadow-none focus-visible:ring-0"
      />
      <NoteEditor
        onChange={(json, text) => {
          setContentJson(json);
          setContent(text);
        }}
      />
    </div>
  );
}
