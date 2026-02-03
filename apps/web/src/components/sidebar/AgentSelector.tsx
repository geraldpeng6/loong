import { useMemo, type SyntheticEvent } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { GatewayAgent } from "@/types/gateway";
import { cn } from "@/lib/utils";

export type AgentSelectorProps = {
  agents: GatewayAgent[];
  currentAgentId: string | null;
  onAgentChange: (agentId: string) => void;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  imageClassName?: string;
  showHoverLabel?: boolean;
};

const DEFAULT_AGENT_IMAGE = "/agents/wuming.png";

const resolveAgentImage = (agentId?: string | null) => {
  if (!agentId) return DEFAULT_AGENT_IMAGE;
  return `/agents/${agentId}.png`;
};

const AgentSelector = ({
  agents,
  currentAgentId,
  onAgentChange,
  className,
  triggerClassName,
  contentClassName,
  imageClassName,
  showHoverLabel = true,
}: AgentSelectorProps) => {
  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === currentAgentId) || agents[0],
    [agents, currentAgentId],
  );
  const agentLabel = currentAgent?.name || currentAgent?.id || "Select agent";

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src.includes(DEFAULT_AGENT_IMAGE)) return;
    event.currentTarget.src = DEFAULT_AGENT_IMAGE;
  };

  return (
    <Select
      value={currentAgent?.id || ""}
      onValueChange={onAgentChange}
      disabled={agents.length === 0}
    >
      <SelectTrigger
        className={cn(
          "group relative h-10 w-10 flex-none justify-center px-0 text-xs",
          triggerClassName,
        )}
        aria-label="Select agent"
        hideIcon
      >
        <div className={cn("relative flex h-10 w-10 items-center justify-center", className)}>
          <img
            src={resolveAgentImage(currentAgent?.id)}
            alt={agentLabel}
            className={cn("rounded-md object-cover", imageClassName || "h-9 w-9")}
            onError={handleImageError}
          />
          {showHoverLabel ? (
            <span
              className={cn(
                "pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2",
                "whitespace-nowrap rounded-md bg-background/95 px-2 py-1 text-[10px]",
                "font-semibold text-foreground shadow-md opacity-0 transition-opacity",
                "group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              {agentLabel}
            </span>
          ) : null}
        </div>
      </SelectTrigger>
      <SelectContent
        side="bottom"
        align="start"
        sideOffset={4}
        avoidCollisions={false}
        className={cn("min-w-[220px] bg-background/95 shadow-lg backdrop-blur", contentClassName)}
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
  );
};

export default AgentSelector;
