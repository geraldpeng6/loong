import { useEffect, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/sidebar/Sidebar";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModelSelector from "@/components/model/ModelSelector";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGateway } from "@/hooks/useGateway";
import { useModelRegistry } from "@/hooks/useModelRegistry";
import type { SessionEntry } from "@/types/gateway";

const App = () => {
  const {
    state,
    sendPrompt,
    switchAgent,
    switchSession,
    renameSession,
    deleteSession,
    refreshSessions,
    createNewSession,
    setModel,
    forkFromEntry,
    setDraft,
    refreshModels,
  } = useGateway();
  const {
    state: modelRegistry,
    refresh: refreshModelRegistry,
    upsertProvider,
  } = useModelRegistry();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("loong.sidebarCollapsed") === "true";
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("loong.theme");
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("loong.sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("loong.theme", theme);
  }, [theme]);

  const handleRename = (session: SessionEntry, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    renameSession(session.path, trimmed);
  };

  const handleDelete = (session: SessionEntry) => {
    if (session.isCurrent) return;
    const confirmed = window.confirm(`Delete ${session.name || session.id}?`);
    if (!confirmed) return;
    deleteSession(session.path);
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <TooltipProvider>
      <div className="relative flex h-screen overflow-hidden">
        <Sidebar
          agents={state.agents}
          currentAgentId={state.currentAgentId}
          onAgentChange={switchAgent}
          sessions={state.sessions}
          currentSessionPath={state.sessionFile}
          onNewSession={createNewSession}
          onRefreshSessions={refreshSessions}
          onSwitchSession={switchSession}
          onRenameSession={handleRename}
          onDeleteSession={handleDelete}
          collapsed={sidebarCollapsed}
        />
        <div className="flex flex-1 flex-col">
          <Header
            status={state.status}
            busy={state.busy}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
            sidebarCollapsed={sidebarCollapsed}
            theme={theme}
            onToggleTheme={toggleTheme}
            modelSelector={
              <ModelSelector
                availableModels={state.availableModels}
                currentModel={state.model}
                catalog={modelRegistry.catalog}
                config={modelRegistry.config}
                onAddProvider={upsertProvider}
                onRefreshModels={() => {
                  refreshModels();
                  refreshModelRegistry();
                }}
                onSetModel={setModel}
              />
            }
          />
          <MessageList
            messages={state.messages}
            forkMessages={state.forkMessages}
            streamingAssistant={state.streamingAssistant}
            onFork={forkFromEntry}
          />
          <div className="h-px bg-border" />
          <Composer
            draft={state.draft}
            onDraftChange={setDraft}
            onSend={sendPrompt}
            busy={state.busy}
          />
        </div>
        <div className="pointer-events-none absolute left-0 right-0 top-14 h-px bg-border" />
      </div>
    </TooltipProvider>
  );
};

export default App;
