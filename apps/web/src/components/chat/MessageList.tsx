import { useEffect, useRef } from "react";

import type { ForkMessage, GatewayMessage } from "@/types/gateway";
import MessageItem from "@/components/chat/MessageItem";

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

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
        {messages.map((message, index) => {
          let forkEntryId: string | null = null;
          if (message.role === "user" || message.role === "user-with-attachments") {
            forkEntryId = forkMessages[userIndex]?.entryId || null;
            userIndex += 1;
          }

          return (
            <MessageItem
              key={`${message.role}-${message.timestamp}-${index}`}
              message={message}
              forkEntryId={forkEntryId}
              onFork={forkEntryId ? onFork : undefined}
            />
          );
        })}
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
