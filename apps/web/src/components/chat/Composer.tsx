import { useEffect, useRef, useState } from "react";

import SendHorizontalIcon from "@/components/ui/send-horizontal-icon";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/useFileUpload";
import type { AttachmentReference, PendingAttachment } from "@/types/upload";
import { getFileKind, formatFileSize } from "@/types/upload";
import { X, Paperclip, Image, FileAudio, FileVideo, FileText, Loader2, Square } from "lucide-react";

export type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string, attachments?: AttachmentReference[]) => void;
  onAbort?: () => void;
  busy: boolean;
};

const FileIcon = ({ mimeType }: { mimeType: string }) => {
  const kind = getFileKind(mimeType);
  switch (kind) {
    case "image":
      return <Image size={16} className="text-blue-500" />;
    case "audio":
      return <FileAudio size={16} className="text-purple-500" />;
    case "video":
      return <FileVideo size={16} className="text-red-500" />;
    case "document":
      return <FileText size={16} className="text-green-500" />;
    default:
      return <Paperclip size={16} className="text-gray-500" />;
  }
};

const Composer = ({ draft, onDraftChange, onSend, onAbort, busy }: ComposerProps) => {
  const [value, setValue] = useState(draft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    pendingAttachments,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    uploadAll,
  } = useFileUpload({
    maxFileSize: 10 * 1024 * 1024, // 10MB
  });

  useEffect(() => {
    setValue(draft);
  }, [draft]);

  const handleSend = async () => {
    const trimmed = value.trim();
    const hasAttachments = pendingAttachments.length > 0;

    if (!trimmed && !hasAttachments) return;

    // Upload pending files first
    if (hasAttachments) {
      const uploaded = await uploadAll();
      const successfulUploads = uploaded
        .filter(
          (a): a is PendingAttachment & { status: "done"; fileId: string; url: string } =>
            a.status === "done" && !!a.fileId && !!a.url,
        )
        .map((a) => ({
          fileId: a.fileId,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
          url: a.url,
        }));

      onSend(trimmed, successfulUploads);
      clearAttachments();
    } else {
      onSend(trimmed);
    }

    setValue("");
    onDraftChange("");
  };

  const handleAbort = () => {
    onAbort?.();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const hasError = pendingAttachments.some((a) => a.status === "error");
  const canSend =
    !busy && !isUploading && (!!value.trim() || pendingAttachments.length > 0) && !hasError;
  const canAbort = busy && !isUploading;

  return (
    <div className="w-full px-4 pb-4 pt-5 sm:px-6 sm:pt-4">
      <div className="mx-auto w-full max-w-4xl">
        {/* Attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.fileId}
                className={`group relative flex items-center gap-2 rounded-lg border px-3 py-2 pr-8 text-sm ${
                  attachment.status === "error"
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
                    : "border-border bg-muted/50"
                }`}
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.fileName}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileIcon mimeType={attachment.mimeType} />
                )}
                <div className="flex flex-col">
                  <span className="max-w-[150px] truncate text-xs font-medium">
                    {attachment.fileName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {attachment.status === "uploading" ? (
                      <span className="flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />
                        Uploading...
                      </span>
                    ) : attachment.status === "error" ? (
                      <span className="text-red-500">{attachment.error || "Error"}</span>
                    ) : (
                      formatFileSize(attachment.size)
                    )}
                  </span>
                </div>
                <button
                  onClick={() => removeAttachment(attachment.fileId)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative" onDrop={handleDrop} onDragOver={handleDragOver}>
          <textarea
            ref={textareaRef}
            className="min-h-[72px] w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-24 pb-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Type a message or drop files here..."
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              onDraftChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (busy) {
                  handleAbort();
                  return;
                }
                handleSend();
              }
            }}
          />

          {/* File attachment button */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-2 left-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || isUploading}
            title="Attach files"
          >
            <Paperclip size={16} />
          </Button>

          {/* Send/stop button */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-2 right-2"
            onClick={busy ? handleAbort : handleSend}
            disabled={busy ? !canAbort : !canSend}
            title={busy ? "Stop" : "Send"}
          >
            {busy ? <Square size={16} /> : <SendHorizontalIcon size={16} />}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,audio/*,video/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />
        </div>

        {/* Drag overlay hint */}
        <div className="mt-1 text-center text-[10px] text-muted-foreground">
          Press Enter to send, Shift+Enter for new line • Drag & drop files to upload
        </div>
      </div>
    </div>
  );
};

export default Composer;
