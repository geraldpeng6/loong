import { useEffect, useRef, useState, type TouchEvent } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/sidebar/Sidebar";
import ExtensionsPanel from "@/features/extensions/ExtensionsPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModelSelector from "@/components/model/ModelSelector";
import AgentSelector from "@/components/sidebar/AgentSelector";
import ArrowNarrowLeftIcon from "@/components/ui/arrow-narrow-left-icon";
import ArrowNarrowRightIcon from "@/components/ui/arrow-narrow-right-icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGateway } from "@/hooks/useGateway";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useModelRegistry } from "@/hooks/useModelRegistry";
import type { SessionEntry } from "@/types/gateway";
import { cn } from "@/lib/utils";

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
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const swipeRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    target: "open" as "open" | "close",
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

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile]);

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

  const SWIPE_THRESHOLD = 60;
  const EDGE_THRESHOLD = 24;

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  };

  const startSwipe = (event: TouchEvent, target: "open" | "close") => {
    const touch = event.touches[0];
    swipeRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      dx: 0,
      dy: 0,
      target,
    };
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!swipeRef.current.active) return;
    const touch = event.touches[0];
    swipeRef.current.dx = touch.clientX - swipeRef.current.startX;
    swipeRef.current.dy = touch.clientY - swipeRef.current.startY;
  };

  const handleTouchEnd = () => {
    if (!swipeRef.current.active) return;
    const { dx, dy, target } = swipeRef.current;
    swipeRef.current.active = false;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (target === "open" && dx > 0) {
      setMobileSidebarOpen(true);
    }
    if (target === "close" && dx < 0) {
      setMobileSidebarOpen(false);
    }
  };

  const handleRootTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile || mobileSidebarOpen) return;
    const touch = event.touches[0];
    if (touch.clientX > EDGE_THRESHOLD) return;
    startSwipe(event, "open");
  };

  const handleSidebarTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile || !mobileSidebarOpen) return;
    startSwipe(event, "close");
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const overlayClassName = cn(
    "fixed inset-0 z-40 bg-black/40 transition-opacity",
    mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
  );
  const drawerClassName = cn(
    "fixed inset-y-0 left-0 z-50 w-[80vw] max-w-[18rem] transform transition-transform duration-200",
    mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
  );
  const toggleClassName = cn(
    "absolute top-1/2 z-30 -translate-y-1/2",
    sidebarCollapsed ? "left-0" : "left-64",
  );

  return (
    <TooltipProvider>
      <div
        className="relative flex h-screen overflow-hidden"
        onTouchStart={handleRootTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isMobile ? (
          <>
            <div className={overlayClassName} onClick={() => setMobileSidebarOpen(false)} />
            <div
              className={drawerClassName}
              onTouchStart={handleSidebarTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <Sidebar
                sessions={state.sessions}
                currentSessionPath={state.sessionFile}
                onNewSession={createNewSession}
                onRefreshSessions={refreshSessions}
                onSwitchSession={switchSession}
                onRenameSession={handleRename}
                onDeleteSession={handleDelete}
                collapsed={false}
                widthClassName="w-full"
                status={state.status}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </div>
          </>
        ) : (
          <Sidebar
            sessions={state.sessions}
            currentSessionPath={state.sessionFile}
            onNewSession={createNewSession}
            onRefreshSessions={refreshSessions}
            onSwitchSession={switchSession}
            onRenameSession={handleRename}
            onDeleteSession={handleDelete}
            collapsed={sidebarCollapsed}
            widthClassName="w-64"
            status={state.status}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        <div className="flex flex-1 flex-col">
          <Header
            busy={state.busy}
            actions={<ExtensionsPanel />}
            agentSelector={
              <AgentSelector
                agents={state.agents}
                currentAgentId={state.currentAgentId}
                onAgentChange={switchAgent}
                triggerClassName="h-8 w-8"
                imageClassName="h-7 w-7"
              />
            }
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
        {!isMobile ? (
          <div className={toggleClassName}>
            <button
              type="button"
              className={cn(
                "flex h-10 w-6 items-center justify-center border border-border/70 bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bg-muted/30",
                "rounded-r-md border-l-0",
              )}
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              {sidebarCollapsed ? (
                <ArrowNarrowRightIcon size={16} />
              ) : (
                <ArrowNarrowLeftIcon size={16} />
              )}
            </button>
          </div>
        ) : null}
        <div className="pointer-events-none absolute left-0 right-0 top-14 h-px bg-border" />
      </div>
    </TooltipProvider>
  );
};

export default App;
