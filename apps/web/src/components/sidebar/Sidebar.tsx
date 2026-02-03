import PlusIcon from "@/components/ui/plus-icon";
import RefreshIcon from "@/components/ui/refresh-icon";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionEntry } from "@/types/gateway";
import SessionList from "@/components/sidebar/SessionList";
import { cn } from "@/lib/utils";

export type SidebarProps = {
  sessions: SessionEntry[];
  currentSessionPath: string | null;
  onNewSession: () => void;
  onRefreshSessions: () => void;
  onSwitchSession: (sessionPath: string) => void;
  onRenameSession: (session: SessionEntry, label: string) => void;
  onDeleteSession: (session: SessionEntry) => void;
  collapsed: boolean;
  widthClassName?: string;
};

const Sidebar = ({
  sessions,
  currentSessionPath,
  onNewSession,
  onRefreshSessions,
  onSwitchSession,
  onRenameSession,
  onDeleteSession,
  collapsed,
  widthClassName,
}: SidebarProps) => {
  const widthClass = widthClassName || "w-64";

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-background transition-all sm:bg-muted/30",
        collapsed ? "w-0 overflow-hidden" : widthClass,
      )}
    >
      <div className="flex h-14 items-center justify-end gap-1 px-3 sm:px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNewSession}>
              <PlusIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New session</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefreshSessions}>
              <RefreshIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1 px-2 py-3 sm:px-3">
        <SessionList
          sessions={sessions}
          currentSessionPath={currentSessionPath}
          onSwitch={onSwitchSession}
          onRename={onRenameSession}
          onDelete={onDeleteSession}
        />
      </ScrollArea>
    </aside>
  );
};

export default Sidebar;
