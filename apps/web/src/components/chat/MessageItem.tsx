import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";

import { Button } from "@/components/ui/button";
import type { GatewayMessage } from "@/types/gateway";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import { extractAttachments, extractText } from "@/components/chat/messageUtils";
import { Image, FileAudio, FileVideo, FileText, Download, ExternalLink } from "lucide-react";
import { getFileKind } from "@/types/upload";

export type MessageItemProps = {
  message: GatewayMessage;
  forkEntryId?: string | null;
  onFork?: (entryId: string) => void;
};

const formatTimestamp = (timestamp?: string | number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const MessageItem = ({ message, forkEntryId, onFork }: MessageItemProps) => {
  const isUser = message.role === "user" || message.role === "user-with-attachments";
  const isTool = message.role === "toolResult";
  const isSystem = message.role === "system";
  const text = extractText(message.content);
  const attachments = extractAttachments(message);
  const timestamp = formatTimestamp(message.timestamp);

  return (
    <div className={cn("w-full", isUser ? "flex justify-end" : "flex justify-start")}>
      <div
        className={cn(
          "flex flex-col gap-2 py-3",
          isUser ? "max-w-[85%] items-end sm:max-w-[70%]" : "max-w-full items-start",
        )}
      >
        <div
          className={cn(
            "max-w-full",
            isUser
              ? "w-fit rounded-2xl bg-foreground px-4 py-3 text-background"
              : "w-full px-0 py-2",
            !isUser && !isTool && !isSystem && "bg-transparent",
            isTool && "w-full rounded-lg bg-muted/70 px-4 py-3 font-mono text-xs",
            isSystem &&
              "w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900",
          )}
        >
          <Markdown text={text} />
        </div>
        {attachments.length > 0 ? (
          <div className={cn("flex flex-wrap gap-2", isUser && "justify-end")}>
            {attachments.map((attachment, index) => {
              const dataUrl = attachment.data
                ? `data:${attachment.mimeType};base64,${attachment.data}`
                : null;
              const previewUrl = attachment.preview
                ? `data:image/png;base64,${attachment.preview}`
                : null;

              // 优先使用服务器 URL（如果有）
              const serverUrl = attachment.url || null;
              const displayUrl = serverUrl || dataUrl || previewUrl;

              if (attachment.kind === "image" && (displayUrl || previewUrl)) {
                return (
                  <div
                    key={`${attachment.fileName}-${index}`}
                    className="group relative overflow-hidden rounded-xl border bg-background"
                  >
                    <img
                      src={previewUrl || displayUrl || ""}
                      alt={attachment.fileName}
                      className="h-32 w-48 object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-white hover:bg-white/20"
                        onClick={() => displayUrl && window.open(displayUrl, "_blank")}
                        title="Open in new tab"
                      >
                        <ExternalLink size={16} />
                      </Button>
                      {displayUrl && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = displayUrl;
                            a.download = attachment.fileName;
                            a.click();
                          }}
                          title="Download"
                        >
                          <Download size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }

              if (attachment.kind === "audio") {
                return (
                  <div
                    key={`${attachment.fileName}-${index}`}
                    className="flex min-w-[200px] items-center gap-3 rounded-xl border bg-background p-3"
                  >
                    <FileAudio size={24} className="text-purple-500" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                      <audio controls className="w-full h-8 mt-1" src={displayUrl || undefined} />
                    </div>
                  </div>
                );
              }

              if (attachment.kind === "video") {
                return (
                  <div
                    key={`${attachment.fileName}-${index}`}
                    className="rounded-xl border bg-background p-2"
                  >
                    <video
                      controls
                      className="h-32 w-48 rounded-lg"
                      src={displayUrl || undefined}
                    />
                    <p className="mt-1 truncate px-1 text-xs text-muted-foreground">
                      {attachment.fileName}
                    </p>
                  </div>
                );
              }

              // Document or other files
              const fileKind = getFileKind(attachment.mimeType);
              const Icon =
                fileKind === "document"
                  ? FileText
                  : fileKind === "audio"
                    ? FileAudio
                    : fileKind === "video"
                      ? FileVideo
                      : fileKind === "image"
                        ? Image
                        : FileText;

              return (
                <a
                  key={`${attachment.fileName}-${index}`}
                  href={displayUrl || "#"}
                  download={attachment.fileName}
                  className="flex min-w-[180px] max-w-[280px] items-center gap-3 rounded-xl border bg-background px-3 py-2 transition-colors hover:bg-muted"
                >
                  <Icon size={20} className="shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{attachment.mimeType}</p>
                  </div>
                  <Download size={14} className="shrink-0 text-muted-foreground" />
                </a>
              );
            })}
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] text-muted-foreground",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          {timestamp}
          {forkEntryId && onFork ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onFork(forkEntryId)}
            >
              <ArrowBackUpIcon size={14} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
