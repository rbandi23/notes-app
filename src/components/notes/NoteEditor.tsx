"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { cn } from "@/lib/utils";
import { ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NOTE_CHAR_LIMIT, IMAGE_MAX_SIZE_BYTES } from "@/lib/constants";

interface NoteEditorProps {
  content?: string | Record<string, unknown>;
  onChange?: (json: unknown, text: string) => void;
  editable?: boolean;
  className?: string;
  noteId?: string;
}

export function NoteEditor({
  content,
  onChange,
  editable = true,
  className,
  noteId,
}: NoteEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing your note...",
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: content || "",
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON(), editor.getText());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm prose-invert max-w-none min-h-[200px] focus:outline-none",
          "px-4 py-3"
        ),
      },
    },
  });

  const charCount = editor?.getText().length || 0;
  const isNearLimit = charCount > NOTE_CHAR_LIMIT * 0.9;
  const isOverLimit = charCount > NOTE_CHAR_LIMIT;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (noteId) formData.append("noteId", noteId);

      const res = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
    >
      {editable && editor && (
        <div className="flex items-center gap-1 border-b px-2 py-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              editor.isActive("bold") && "bg-muted text-foreground"
            )}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "rounded px-2 py-1 text-xs italic text-muted-foreground hover:bg-muted hover:text-foreground",
              editor.isActive("italic") && "bg-muted text-foreground"
            )}
          >
            I
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={cn(
              "rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              editor.isActive("heading", { level: 2 }) &&
                "bg-muted text-foreground"
            )}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
              editor.isActive("bulletList") && "bg-muted text-foreground"
            )}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={cn(
              "rounded px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground",
              editor.isActive("codeBlock") && "bg-muted text-foreground"
            )}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin text-amber-800" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}
      <EditorContent editor={editor} />
      {editable && (
        <div className="flex justify-end px-3 py-1.5 text-xs text-muted-foreground">
          <span className={cn(isOverLimit && "text-destructive", isNearLimit && !isOverLimit && "text-amber-500")}>
            {charCount.toLocaleString()} / {NOTE_CHAR_LIMIT.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
