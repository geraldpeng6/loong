import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";

import PenIcon from "@/components/ui/pen-icon";
import TrashIcon from "@/components/ui/trash-icon";

import { Button } from "@/components/ui/button";
import type { SessionEntry } from "@/types/gateway";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 60;
const ROW_GAP = 8;
const ITEM_SIZE = ROW_HEIGHT + ROW_GAP;
const OVERSCAN_COUNT = 4;

export type SessionListProps = {
  sessions: SessionEntry[];
  currentSessionPath: string | null;
  onSwitch: (sessionPath: string) => void;
  onRename: (session: SessionEntry, label: string) => void;
  onDelete: (session: SessionEntry) => void;
  className?: string;
};

type SessionRowData = {
  sessions: SessionEntry[];
  currentSessionPath: string | null;
  editingId: string | null;
  editingValue: string;
  setEditingId: (value: string | null) => void;
  setEditingValue: (value: string) => void;
  onSwitch: (sessionPath: string) => void;
  onDelete: (session: SessionEntry) => void;
  handleCommit: (session: SessionEntry) => void;
  handleCancel: () => void;
};

const SessionRow = ({ index, style, data }: ListChildComponentProps<SessionRowData>) => {
  const session = data.sessions[index];
  if (!session) return null;
  const isActive = session.isCurrent || session.path === data.currentSessionPath;
  const isEditing = data.editingId === session.id;
  const sizeTextClass = "text-muted-foreground";

  return (
    <div style={{ ...style, boxSizing: "border-box", paddingBottom: ROW_GAP }}>
      <div
        className={cn(
          "grid h-[60px] grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-2 py-2 transition-colors",
          isActive ? "border-foreground/40" : "border-transparent",
          !isActive && !isEditing && "hover:bg-muted/40",
          !isEditing && "cursor-pointer",
        )}
        onClick={() => {
          if (isEditing) return;
          data.onSwitch(session.path);
        }}
      >
        <div className="min-w-0 overflow-hidden">
          {isEditing ? (
            <input
              className={cn(
                "w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                isActive && "border-background/30",
              )}
              value={data.editingValue}
              onChange={(event) => data.setEditingValue(event.target.value)}
              onBlur={() => data.handleCommit(session)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  data.handleCommit(session);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  data.handleCancel();
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
              data.setEditingId(session.id);
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
              data.onDelete(session);
            }}
            disabled={isActive}
          >
            <TrashIcon size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};

const SessionList = ({
  sessions,
  currentSessionPath,
  onSwitch,
  onRename,
  onDelete,
  className,
}: SessionListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setContainerSize({ width, height });
    };

    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => update());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleCommit = useCallback(
    (session: SessionEntry) => {
      const trimmed = editingValue.trim();
      setEditingId(null);
      setEditingValue("");
      if (!trimmed) return;
      if (trimmed === (session.name || session.id)) return;
      onRename(session, trimmed);
    },
    [editingValue, onRename],
  );

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditingValue("");
  }, []);

  const itemData = useMemo<SessionRowData>(
    () => ({
      sessions,
      currentSessionPath,
      editingId,
      editingValue,
      setEditingId,
      setEditingValue,
      onSwitch,
      onDelete,
      handleCommit,
      handleCancel,
    }),
    [
      sessions,
      currentSessionPath,
      editingId,
      editingValue,
      onSwitch,
      onDelete,
      handleCommit,
      handleCancel,
    ],
  );

  const canRender = containerSize.height > 0 && containerSize.width > 0;

  return (
    <div ref={containerRef} className={cn("h-full w-full min-h-0", className)}>
      {canRender ? (
        <List
          height={containerSize.height}
          width={containerSize.width}
          itemCount={sessions.length}
          itemSize={ITEM_SIZE}
          itemData={itemData}
          overscanCount={OVERSCAN_COUNT}
          itemKey={(index, data) => data.sessions[index]?.id || index}
        >
          {SessionRow}
        </List>
      ) : null}
    </div>
  );
};

export default SessionList;
