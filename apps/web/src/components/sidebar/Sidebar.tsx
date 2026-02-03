import { useMemo, type SyntheticEvent } from "react";

import PlusIcon from "@/components/ui/plus-icon";
import RefreshIcon from "@/components/ui/refresh-icon";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GatewayAgent, SessionEntry } from "@/types/gateway";
import SessionList from "@/components/sidebar/SessionList";
import { cn } from "@/lib/utils";

export type SidebarProps = {
  agents: GatewayAgent[];
  currentAgentId: string | null;
  onAgentChange: (agentId: string) => void;
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

const DEFAULT_AGENT_IMAGE = "/agents/wuming.png";

const resolveAgentImage = (agentId?: string | null) => {
  if (!agentId) return DEFAULT_AGENT_IMAGE;
  return `/agents/${agentId}.png`;
};

const Sidebar = ({
  agents,
  currentAgentId,
  onAgentChange,
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
  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === currentAgentId) || agents[0],
    [agents, currentAgentId],
  );
  const agentLabel = currentAgent?.name || currentAgent?.id || "Select agent";

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src.includes(DEFAULT_AGENT_IMAGE)) return;
    event.currentTarget.src = DEFAULT_AGENT_IMAGE;
  };

  const widthClass = widthClassName || "w-64";
  const isCollapsed = collapsed;
  const effectiveWidthClass = isCollapsed ? "w-14" : widthClass;

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-muted/30 transition-all",
        isCollapsed ? `overflow-hidden ${effectiveWidthClass}` : effectiveWidthClass,
      )}
    >
      <div
        className={cn("flex items-center gap-2 px-3 py-3 sm:px-4", isCollapsed && "justify-center")}
      >
        <Select
          value={currentAgent?.id || ""}
          onValueChange={onAgentChange}
          disabled={agents.length === 0}
        >
          <SelectTrigger
            className="h-10 w-10 flex-none justify-center px-0 text-xs"
            aria-label="Select agent"
          >
            <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "gap-0")}>
              <img
                src={resolveAgentImage(currentAgent?.id)}
                alt={agentLabel}
                className="h-9 w-9 rounded-md object-cover"
                onError={handleImageError}
              />
              <span className="sr-only">{agentLabel}</span>
            </div>
          </SelectTrigger>
          <SelectContent
            side="bottom"
            align="start"
            sideOffset={4}
            avoidCollisions={false}
            className="min-w-[220px] bg-background/95 shadow-lg backdrop-blur"
          >
            {agents.map((agent) => {
              const imageSrc = resolveAgentImage(agent.id);
              return (
                <SelectItem key={agent.id} value={agent.id} className="pl-2 pr-2 py-2">
                  <div className="flex items-center gap-3">
                    <img
                      src={imageSrc}
                      alt={agent.name || agent.id}
                      className="h-9 w-9 rounded-md object-cover"
                      onError={handleImageError}
                    />
                    <span className="truncate text-xs font-semibold">{agent.name || agent.id}</span>
                  </div>
                </SelectItem>
              );
            })}
            {agents.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No agents.</div>
            ) : null}
          </SelectContent>
        </Select>
        {!isCollapsed ? (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onNewSession}>
                  <PlusIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New session</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onRefreshSessions}>
                  <RefreshIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      {!isCollapsed ? (
        <ScrollArea className="flex-1 px-2 py-3 sm:px-3">
          <SessionList
            sessions={sessions}
            currentSessionPath={currentSessionPath}
            onSwitch={onSwitchSession}
            onRename={onRenameSession}
            onDelete={onDeleteSession}
          />
        </ScrollArea>
      ) : null}
    </aside>
  );
};

export default Sidebar;
