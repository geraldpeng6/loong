import type { ReactNode } from "react";

import RefreshIcon from "@/components/ui/refresh-icon";

type HeaderProps = {
  busy: boolean;
  modelSelector?: ReactNode;
  agentSelector?: ReactNode;
};

const Header = ({ busy, modelSelector, agentSelector }: HeaderProps) => (
  <header className="flex h-14 items-center bg-background px-3 sm:px-4">
    <div className="flex min-w-0 items-center gap-3">
      {agentSelector ? <div className="flex h-8 items-center">{agentSelector}</div> : null}
      {busy ? <RefreshIcon size={16} className="animate-spin text-muted-foreground" /> : null}
      {modelSelector ? <div className="min-w-0">{modelSelector}</div> : null}
    </div>
  </header>
);

export default Header;
