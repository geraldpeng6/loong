import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";

import { Button } from "@/components/ui/button";
import type { GatewayMessage } from "@/types/gateway";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import { extractAttachments, extractText } from "@/components/chat/messageUtils";

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
          isUser ? "max-w-[70%] items-end" : "max-w-full items-start",
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

              if (attachment.kind === "image" && (dataUrl || previewUrl)) {
                return (
                  <button
                    key={`${attachment.fileName}-${index}`}
                    type="button"
                    className="overflow-hidden rounded-xl border bg-background"
                    onClick={() => dataUrl && window.open(dataUrl, "_blank")}
                  >
                    <img
                      src={previewUrl || dataUrl || ""}
                      alt={attachment.fileName}
                      className="h-32 w-48 object-cover"
                    />
                  </button>
                );
              }

              if (attachment.kind === "audio") {
                return (
                  <div
                    key={`${attachment.fileName}-${index}`}
                    className="rounded-xl border bg-background p-2"
                  >
                    <audio controls src={dataUrl || undefined} />
                  </div>
                );
              }

              if (attachment.kind === "video") {
                return (
                  <div
                    key={`${attachment.fileName}-${index}`}
                    className="rounded-xl border bg-background p-2"
                  >
                    <video controls className="h-32 w-48" src={dataUrl || undefined} />
                  </div>
                );
              }

              return (
                <a
                  key={`${attachment.fileName}-${index}`}
                  href={dataUrl || "#"}
                  download={attachment.fileName}
                  className="rounded-xl border bg-background px-3 py-2 text-xs underline"
                >
                  {attachment.fileName}
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
