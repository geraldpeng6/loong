import { useState } from "react";
import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";

import ImageLightbox from "@/components/chat/ImageLightbox";
import ImageWithPlaceholder from "@/components/ui/image-with-placeholder";
import { Button } from "@/components/ui/button";
import type { GatewayMessage } from "@/types/gateway";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import MediaGrid from "@/components/chat/MediaGrid";
import {
  extractAttachments,
  extractText,
  extractToolCalls,
  type AttachmentItem,
  type ToolCallItem,
} from "@/components/chat/messageUtils";
import {
  Image,
  FileAudio,
  FileVideo,
  FileText,
  Download,
  ZoomIn,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { getFileKind } from "@/types/upload";

export type MessageItemProps = {
  message: GatewayMessage;
  forkEntryId?: string | null;
  onFork?: (entryId: string) => void;
  toolCallsOverride?: ToolCallItem[];
  toolResults?: GatewayMessage[];
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

const getMessageError = (message: GatewayMessage) => {
  if (typeof message.errorMessage === "string" && message.errorMessage.trim()) {
    return message.errorMessage.trim();
  }
  if (typeof message.error?.message === "string" && message.error.message.trim()) {
    return message.error.message.trim();
  }
  if (message.stopReason === "error") {
    return "模型调用失败，请检查 API Key 或模型配置。";
  }
  return null;
};

const formatToolArguments = (toolCall: ToolCallItem) => {
  if (typeof toolCall.arguments === "string" && toolCall.arguments.trim()) {
    return toolCall.arguments.trim();
  }
  if (toolCall.arguments && typeof toolCall.arguments === "object") {
    try {
      return JSON.stringify(toolCall.arguments, null, 2);
    } catch {
      return String(toolCall.arguments);
    }
  }
  if (typeof toolCall.partialJson === "string" && toolCall.partialJson.trim()) {
    return toolCall.partialJson.trim();
  }
  return "";
};

const MessageItem = ({
  message,
  forkEntryId,
  onFork,
  toolCallsOverride,
  toolResults,
}: MessageItemProps) => {
  const isUser = message.role === "user" || message.role === "user-with-attachments";
  const isTool = message.role === "toolResult";
  const isSystem = message.role === "system";
  const text = extractText(message.content);
  const toolCalls = toolCallsOverride ?? extractToolCalls(message.content);
  const errorText = getMessageError(message);
  const attachments = extractAttachments(message);
  const combinedToolResults =
    Array.isArray(toolResults) && toolResults.length > 0 ? toolResults : null;
  const combinedResultText = combinedToolResults
    ? combinedToolResults
        .map((result) => extractText(result.content))
        .filter((value) => value.trim().length > 0)
        .join("\n")
    : "";
  const combinedResultAttachments = combinedToolResults
    ? combinedToolResults.flatMap((result) => extractAttachments(result))
    : [];
  const combinedMediaAttachments = combinedResultAttachments.filter(
    (attachment) => attachment.kind === "image" || attachment.kind === "video",
  );
  const combinedOtherAttachments = combinedResultAttachments.filter(
    (attachment) => attachment.kind !== "image" && attachment.kind !== "video",
  );
  const useCombinedMediaGrid = combinedMediaAttachments.length > 1;
  const mediaAttachments = attachments.filter(
    (attachment) => attachment.kind === "image" || attachment.kind === "video",
  );
  const otherAttachments = attachments.filter(
    (attachment) => attachment.kind !== "image" && attachment.kind !== "video",
  );
  const useMediaGrid = mediaAttachments.length > 1;
  const timestamp = formatTimestamp(message.timestamp);
  const hasText = text.trim().length > 0;
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (isSystem) {
    return (
      <div className="flex w-full justify-center py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{text}</span>
          {timestamp ? <span>· {timestamp}</span> : null}
        </div>
      </div>
    );
  }

  const renderAttachment = (attachment: AttachmentItem, index: number) => {
    const dataUrl = attachment.data
      ? `data:${attachment.mimeType};base64,${attachment.data}`
      : null;
    const previewUrl = attachment.preview ? `data:image/png;base64,${attachment.preview}` : null;

    // 优先使用服务器 URL（如果有）
    const serverUrl = attachment.url || null;
    const displayUrl = serverUrl || dataUrl || previewUrl;

    if (attachment.kind === "image" && (displayUrl || previewUrl)) {
      const lightboxUrl = displayUrl || previewUrl || null;

      return (
        <div
          key={`${attachment.fileName}-${index}`}
          className="group relative cursor-zoom-in overflow-hidden rounded-xl border bg-background"
          onClick={() => {
            if (!lightboxUrl) return;
            setLightbox({ src: lightboxUrl, alt: attachment.fileName });
          }}
        >
          <ImageWithPlaceholder
            src={displayUrl || previewUrl || ""}
            alt={attachment.fileName}
            previewSrc={displayUrl ? previewUrl : null}
            className="h-32 w-48"
            imageClassName="object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                if (!lightboxUrl) return;
                setLightbox({ src: lightboxUrl, alt: attachment.fileName });
              }}
              title="Preview"
            >
              <ZoomIn size={16} />
            </Button>
            {displayUrl && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={(event) => {
                  event.stopPropagation();
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
          <video controls className="h-32 w-48 rounded-lg" src={displayUrl || undefined} />
          <p className="mt-1 truncate px-1 text-xs text-muted-foreground">{attachment.fileName}</p>
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
  };

  const renderToolCall = (toolCall: ToolCallItem, index: number) => {
    const argsText = formatToolArguments(toolCall);
    const toolName = toolCall.name || "工具";
    return (
      <details
        key={`${toolCall.id || toolName}-${index}`}
        className="w-full rounded-lg border bg-muted/50 px-3 py-2 text-xs"
      >
        <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <Wrench size={14} />
          <span className="text-foreground">{toolName}</span>
        </summary>
        {argsText ? (
          <pre className="mt-2 whitespace-pre-wrap text-xs text-foreground">{argsText}</pre>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">无参数</p>
        )}
      </details>
    );
  };

  const renderToolResult = () => {
    const toolName = message.toolName || "工具";
    return (
      <details className="w-full rounded-lg border bg-muted/70 px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <Wrench size={14} />
          <span className="text-foreground">{toolName}</span>
        </summary>
        {hasText ? (
          <div className="mt-2 text-foreground">
            <Markdown text={text} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">无输出</p>
        )}
      </details>
    );
  };

  const renderToolCallResult = () => {
    if (!combinedToolResults || toolCalls.length === 0) return null;
    const toolNames = [
      ...toolCalls.map((call) => call.name).filter(Boolean),
      ...combinedToolResults.map((result) => result.toolName).filter(Boolean),
    ];
    const uniqueToolNames = Array.from(new Set(toolNames));
    const toolLabel =
      uniqueToolNames.length === 0
        ? "工具"
        : uniqueToolNames.length === 1
          ? uniqueToolNames[0]
          : `${uniqueToolNames[0]} +${uniqueToolNames.length - 1}`;

    return (
      <details className="w-full rounded-lg border bg-muted/70 px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <Wrench size={14} />
          <span className="text-foreground">{toolLabel}</span>
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">命令</p>
            {toolCalls.map((call, index) => {
              const argsText = formatToolArguments(call);
              const callLabel = call.name || `工具 ${index + 1}`;
              return (
                <div key={`${call.id || callLabel}-${index}`} className="mt-1">
                  {toolCalls.length > 1 ? (
                    <p className="text-[11px] text-muted-foreground">{callLabel}</p>
                  ) : null}
                  {argsText ? (
                    <pre className="whitespace-pre-wrap text-xs text-foreground">{argsText}</pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">无参数</p>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">结果</p>
            {combinedResultText ? (
              <div className="mt-1 text-foreground">
                <Markdown text={combinedResultText} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">无输出</p>
            )}
            {combinedResultAttachments.length > 0 ? (
              useCombinedMediaGrid ? (
                <div className="mt-2 flex w-full flex-col gap-2">
                  <MediaGrid attachments={combinedMediaAttachments} />
                  {combinedOtherAttachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {combinedOtherAttachments.map(renderAttachment)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {combinedResultAttachments.map(renderAttachment)}
                </div>
              )
            ) : null}
          </div>
        </div>
      </details>
    );
  };

  const showTextBubble = hasText && !isTool;
  const showToolCalls = !isTool && !combinedToolResults && toolCalls.length > 0;
  const showCombinedToolGroup = !isTool && !!combinedToolResults && toolCalls.length > 0;
  const showError = !isTool && !!errorText;

  return (
    <>
      <div className={cn("w-full", isUser ? "flex justify-end" : "flex justify-start")}>
        <div
          className={cn(
            "flex flex-col gap-2 py-3",
            isUser ? "max-w-[85%] items-end sm:max-w-[70%]" : "max-w-full items-start",
          )}
        >
          {isTool ? (
            <div className="w-full">{renderToolResult()}</div>
          ) : showTextBubble ? (
            <div
              className={cn(
                "max-w-full",
                isUser
                  ? "w-fit rounded-2xl bg-foreground px-4 py-3 text-background"
                  : "w-full px-0 py-2",
                !isUser && "bg-transparent",
              )}
            >
              <Markdown text={text} />
            </div>
          ) : null}
          {showCombinedToolGroup ? <div className="w-full">{renderToolCallResult()}</div> : null}
          {showToolCalls ? (
            <div className="flex w-full flex-col gap-2">{toolCalls.map(renderToolCall)}</div>
          ) : null}
          {showError ? (
            <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle size={16} />
                <span>调用失败</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-red-700">{errorText}</pre>
            </div>
          ) : null}
          {attachments.length > 0 ? (
            useMediaGrid ? (
              <div className={cn("flex w-full flex-col gap-2", isUser && "items-end")}>
                <MediaGrid attachments={mediaAttachments} />
                {otherAttachments.length > 0 ? (
                  <div className={cn("flex flex-wrap gap-2", isUser && "justify-end")}>
                    {otherAttachments.map(renderAttachment)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={cn("flex flex-wrap gap-2", isUser && "justify-end")}>
                {attachments.map(renderAttachment)}
              </div>
            )
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
      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
        src={lightbox?.src || null}
        alt={lightbox?.alt}
      />
    </>
  );
};

export default MessageItem;
