import type { ReactNode } from "react";

import RefreshIcon from "@/components/ui/refresh-icon";

type HeaderProps = {
  busy: boolean;
  modelSelector?: ReactNode;
  agentSelector?: ReactNode;
  actions?: ReactNode;
};

const Header = ({ busy, modelSelector, agentSelector, actions }: HeaderProps) => (
  <header className="flex h-14 items-center justify-between bg-background px-3 sm:px-4">
    <div className="flex min-w-0 items-center gap-3">
      {agentSelector ? <div className="flex h-8 items-center">{agentSelector}</div> : null}
      {busy ? <RefreshIcon size={16} className="animate-spin text-muted-foreground" /> : null}
      {modelSelector ? <div className="min-w-0">{modelSelector}</div> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </header>
);

export default Header;
