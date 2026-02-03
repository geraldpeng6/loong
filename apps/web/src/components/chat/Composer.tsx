import { useEffect, useState } from "react";

import SendHorizontalIcon from "@/components/ui/send-horizontal-icon";
import { Button } from "@/components/ui/button";

export type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
};

const Composer = ({ draft, onDraftChange, onSend, busy }: ComposerProps) => {
  const [value, setValue] = useState(draft);

  useEffect(() => {
    setValue(draft);
  }, [draft]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    onDraftChange("");
  };

  return (
    <div className="w-full px-4 pb-4 pt-5 sm:px-6 sm:pt-4">
      <div className="mx-auto w-full max-w-4xl">
        <div className="relative">
          <textarea
            className="min-h-[72px] w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 pb-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Type a message..."
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              onDraftChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-2 right-2"
            onClick={handleSend}
            disabled={busy}
          >
            <SendHorizontalIcon size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Composer;
