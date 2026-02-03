import type { ReactNode } from "react";

import ArrowNarrowLeftIcon from "@/components/ui/arrow-narrow-left-icon";
import ArrowNarrowRightIcon from "@/components/ui/arrow-narrow-right-icon";
import RefreshIcon from "@/components/ui/refresh-icon";
import { Button } from "@/components/ui/button";

type HeaderProps = {
  busy: boolean;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  modelSelector?: ReactNode;
  agentSelector?: ReactNode;
};

const Header = ({
  busy,
  onToggleSidebar,
  sidebarCollapsed,
  modelSelector,
  agentSelector,
}: HeaderProps) => (
  <header className="flex h-14 items-center bg-background px-3 sm:px-4">
    <div className="flex min-w-0 items-center gap-3">
      {agentSelector ? <div className="flex h-8 items-center">{agentSelector}</div> : null}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        {sidebarCollapsed ? <ArrowNarrowRightIcon size={16} /> : <ArrowNarrowLeftIcon size={16} />}
      </Button>
      {busy ? <RefreshIcon size={16} className="animate-spin text-muted-foreground" /> : null}
      {modelSelector ? <div className="min-w-0">{modelSelector}</div> : null}
    </div>
  </header>
);

export default Header;
