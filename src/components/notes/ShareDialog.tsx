"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shareNote, unshareNote } from "@/hooks/use-notes";
import { Copy, Check, Link2, Link2Off } from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  isPublic: boolean;
  shareToken: string | null;
  onShareChange: () => void;
}

export function ShareDialog({
  open,
  onOpenChange,
  noteId,
  isPublic,
  shareToken,
  onShareChange,
}: ShareDialogProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken
    ? `${window.location.origin}/share/${shareToken}`
    : "";

  async function handleShare() {
    setLoading(true);
    await shareNote(noteId);
    onShareChange();
    setLoading(false);
  }

  async function handleUnshare() {
    setLoading(true);
    await unshareNote(noteId);
    onShareChange();
    setLoading(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Note</DialogTitle>
          <DialogDescription>
            {isPublic
              ? "Anyone with the link can view this note."
              : "Generate a link to share this note publicly."}
          </DialogDescription>
        </DialogHeader>

        {isPublic && shareToken ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This note is currently private. Click below to make it shareable.
          </p>
        )}

        <DialogFooter>
          {isPublic ? (
            <Button
              variant="destructive"
              onClick={handleUnshare}
              disabled={loading}
            >
              <Link2Off className="size-4" />
              {loading ? "Revoking..." : "Revoke Access"}
            </Button>
          ) : (
            <Button onClick={handleShare} disabled={loading}>
              <Link2 className="size-4" />
              {loading ? "Generating..." : "Generate Link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
