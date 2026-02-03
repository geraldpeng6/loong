import type { ReactNode } from "react";

import ArrowNarrowLeftIcon from "@/components/ui/arrow-narrow-left-icon";
import ArrowNarrowRightIcon from "@/components/ui/arrow-narrow-right-icon";
import BrightnessDownIcon from "@/components/ui/brightness-down-icon";
import MoonIcon from "@/components/ui/moon-icon";
import PlugConnectedIcon from "@/components/ui/plug-connected-icon";
import RefreshIcon from "@/components/ui/refresh-icon";
import { Button } from "@/components/ui/button";
import type { GatewayStatus } from "@/hooks/useGateway";
import { cn } from "@/lib/utils";

type HeaderProps = {
  status: GatewayStatus;
  busy: boolean;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  modelSelector?: ReactNode;
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

const Header = ({
  status,
  busy,
  onToggleSidebar,
  sidebarCollapsed,
  modelSelector,
  theme,
  onToggleTheme,
}: HeaderProps) => {
  const statusClass =
    status === "connected"
      ? "text-emerald-500"
      : status === "disconnected"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <header className="flex h-14 items-center justify-between bg-background px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          {sidebarCollapsed ? (
            <ArrowNarrowRightIcon size={16} />
          ) : (
            <ArrowNarrowLeftIcon size={16} />
          )}
        </Button>
        {busy ? <RefreshIcon size={16} className="animate-spin text-muted-foreground" /> : null}
        {modelSelector ? <div className="min-w-0">{modelSelector}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <BrightnessDownIcon size={16} /> : <MoonIcon size={16} />}
        </Button>
        <PlugConnectedIcon className={cn(statusClass)} size={16} />
        <span className="text-xs font-semibold tracking-[0.4em] text-muted-foreground leading-none">
          LOONG
        </span>
      </div>
    </header>
  );
};

export default Header;
