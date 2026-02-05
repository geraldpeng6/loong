import { useEffect, useRef } from "react";

import type { ForkMessage, GatewayMessage } from "@/types/gateway";
import MessageItem from "@/components/chat/MessageItem";
import { extractText, extractToolCalls } from "@/components/chat/messageUtils";

export type MessageListProps = {
  messages: GatewayMessage[];
  forkMessages: ForkMessage[];
  streamingAssistant: string | null;
  onFork: (entryId: string) => void;
};

const MessageList = ({ messages, forkMessages, streamingAssistant, onFork }: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingAssistant]);

  let userIndex = 0;
  const renderedMessages: JSX.Element[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (message.role === "assistant") {
      const toolCalls = extractToolCalls(message.content);
      const text = extractText(message.content).trim();
      if (toolCalls.length > 0 && !text) {
        const toolCallIds = new Set(toolCalls.map((call) => call.id).filter(Boolean));
        const toolResults: GatewayMessage[] = [];
        let j = index + 1;

        while (j < messages.length && messages[j].role === "toolResult") {
          const result = messages[j];
          if (toolCallIds.size > 0) {
            if (result.toolCallId && toolCallIds.has(result.toolCallId)) {
              toolResults.push(result);
              j += 1;
              continue;
            }
            if (!result.toolCallId) {
              toolResults.push(result);
              j += 1;
              continue;
            }
            break;
          }
          toolResults.push(result);
          j += 1;
        }

        if (toolResults.length > 0) {
          const lastResult = toolResults[toolResults.length - 1];
          renderedMessages.push(
            <MessageItem
              key={`tool-group-${message.timestamp}-${lastResult?.timestamp ?? index}`}
              message={message}
              toolCallsOverride={toolCalls}
              toolResults={toolResults}
            />,
          );
          index = j - 1;
          continue;
        }
      }
    }

    let forkEntryId: string | null = null;
    if (message.role === "user" || message.role === "user-with-attachments") {
      forkEntryId = forkMessages[userIndex]?.entryId || null;
      userIndex += 1;
    }

    renderedMessages.push(
      <MessageItem
        key={`${message.role}-${message.timestamp}-${index}`}
        message={message}
        forkEntryId={forkEntryId}
        onFork={forkEntryId ? onFork : undefined}
      />,
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
        {renderedMessages}
        {streamingAssistant ? (
          <MessageItem
            message={{ role: "assistant", content: streamingAssistant, timestamp: Date.now() }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default MessageList;
