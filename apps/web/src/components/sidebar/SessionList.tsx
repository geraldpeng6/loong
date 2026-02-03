import { useEffect, useState } from "react";

import PenIcon from "@/components/ui/pen-icon";
import TrashIcon from "@/components/ui/trash-icon";

import { Button } from "@/components/ui/button";
import type { SessionEntry } from "@/types/gateway";
import { cn } from "@/lib/utils";

export type SessionListProps = {
  sessions: SessionEntry[];
  currentSessionPath: string | null;
  onSwitch: (sessionPath: string) => void;
  onRename: (session: SessionEntry, label: string) => void;
  onDelete: (session: SessionEntry) => void;
};

const SessionList = ({
  sessions,
  currentSessionPath,
  onSwitch,
  onRename,
  onDelete,
}: SessionListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    if (!editingId) return;
    const session = sessions.find((entry) => entry.id === editingId);
    if (!session) {
      setEditingId(null);
      setEditingValue("");
      return;
    }
    setEditingValue(session.name || session.id);
  }, [editingId, sessions]);

  const handleCommit = (session: SessionEntry) => {
    const trimmed = editingValue.trim();
    setEditingId(null);
    setEditingValue("");
    if (!trimmed) return;
    if (trimmed === (session.name || session.id)) return;
    onRename(session, trimmed);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingValue("");
  };

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => {
        const isActive = session.isCurrent || session.path === currentSessionPath;
        const isEditing = editingId === session.id;
        const sizeTextClass = "text-muted-foreground";
        return (
          <div
            key={session.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-2 py-2 transition-colors",
              isActive ? "border-foreground/40" : "border-transparent",
              !isActive && !isEditing && "hover:bg-muted/40",
              !isEditing && "cursor-pointer",
            )}
            onClick={() => {
              if (isEditing) return;
              onSwitch(session.path);
            }}
          >
            <div className="min-w-0 overflow-hidden">
              {isEditing ? (
                <input
                  className={cn(
                    "w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                    isActive && "border-background/30",
                  )}
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => handleCommit(session)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCommit(session);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancel();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className="truncate text-left text-xs font-medium"
                  title={session.name || session.id}
                >
                  {session.name || session.id}
                </div>
              )}
              <div className={cn("truncate text-left text-[10px]", sizeTextClass)}>
                {session.sizeText || ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingId(session.id);
                }}
              >
                <PenIcon size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(session);
                }}
                disabled={isActive}
              >
                <TrashIcon size={14} />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SessionList;
