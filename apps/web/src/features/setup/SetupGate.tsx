import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SetupStatus } from "@/hooks/useSetup";
import type { ProviderCatalog, ProviderConfig } from "@/types/modelRegistry";

type SetupGateProps = {
  loading: boolean;
  error: string | null;
  status: SetupStatus | null;
  catalog: ProviderCatalog[];
  onRefresh: () => Promise<unknown>;
  onLogin: (password: string) => Promise<unknown>;
  onRegister: (payload: { username: string; password: string }) => Promise<unknown>;
  onSaveProvider: (providerId: string, provider: ProviderConfig) => Promise<unknown>;
  onRefreshModels: () => void;
  onReconnect: () => void;
  onSetModel: (provider: string, modelId: string) => void;
  onSkipProvider?: () => void;
};

const titleClass = "text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground";

const SetupGate = ({
  loading,
  error,
  status,
  catalog,
  onRefresh,
  onLogin,
  onRegister,
  onSaveProvider,
  onRefreshModels,
  onReconnect,
  onSetModel,
  onSkipProvider,
}: SetupGateProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("admin");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirm, setRegisterConfirm] = useState("");
  const [providerId, setProviderId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");

  useEffect(() => {
    if (!providerId) {
      setProviderId(catalog[0]?.id || "openai");
    }
  }, [catalog, providerId]);

  const auth = status?.auth;
  const needsRegister = Boolean(auth?.canRegister);
  const needsLogin = Boolean(auth?.required && !auth?.authorized);
  const needsProvider = Boolean(auth?.authorized && status && !status.models.hasConfiguredProvider);
  const activeStep = useMemo(() => {
    if (needsRegister) return "register";
    if (needsLogin) return "login";
    if (needsProvider) return "provider";
    return "done";
  }, [needsLogin, needsProvider, needsRegister]);

  if (activeStep === "done") return null;

  const handleRefresh = async () => {
    setMessage(null);
    try {
      await onRefresh();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Refresh failed";
      setMessage(text);
    }
  };

  const withSubmit = async (action: () => Promise<unknown>) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await action();
      setMessage("Saved");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Request failed";
      setMessage(text);
    } finally {
      setSubmitting(false);
    }
  };

  const submitLogin = async () => {
    await withSubmit(async () => {
      await onLogin(loginPassword);
      setLoginPassword("");
      onReconnect();
      onRefreshModels();
    });
  };

  const submitRegister = async () => {
    if (registerPassword !== registerConfirm) {
      setMessage("Passwords do not match");
      return;
    }
    await withSubmit(async () => {
      await onRegister({ username: registerUsername, password: registerPassword });
      setRegisterPassword("");
      setRegisterConfirm("");
      onReconnect();
      onRefreshModels();
    });
  };

  const submitProvider = async () => {
    if (!providerId || !modelId.trim()) {
      setMessage("Provider and default model are required");
      return;
    }

    await withSubmit(async () => {
      const provider: ProviderConfig = {
        api: "openai-completions",
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        models: [{ id: modelId.trim() }],
      };
      await onSaveProvider(providerId, provider);
      onSetModel(providerId, modelId.trim());
      onRefreshModels();
      await onRefresh();
    });
  };

  const headline =
    activeStep === "register"
      ? "Initialize Loong"
      : activeStep === "login"
        ? "Sign in"
        : "Configure provider";

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-1">
          <div className={titleClass}>First-time setup</div>
          <h1 className="text-xl font-semibold">{headline}</h1>
          <p className="text-sm text-muted-foreground">
            {activeStep === "register"
              ? "Create the first admin account and password for Web UI access."
              : activeStep === "login"
                ? "Enter the server password to unlock Loong."
                : "Set a provider and default model so chat works immediately."}
          </p>
        </div>

        {activeStep === "register" ? (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Username</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={registerUsername}
                onChange={(event) => setRegisterUsername(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                type="password"
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Confirm password</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                type="password"
                value={registerConfirm}
                onChange={(event) => setRegisterConfirm(event.target.value)}
              />
            </label>
            <Button className="w-full" disabled={submitting} onClick={submitRegister}>
              {submitting ? "Saving..." : "Create account"}
            </Button>
          </div>
        ) : null}

        {activeStep === "login" ? (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={submitting} onClick={handleRefresh}>
                Refresh
              </Button>
              <Button disabled={submitting} onClick={submitLogin}>
                {submitting ? "Checking..." : "Unlock"}
              </Button>
            </div>
          </div>
        ) : null}

        {activeStep === "provider" ? (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Provider</span>
              {catalog.length > 0 ? (
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                >
                  {catalog.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                  placeholder="openai"
                />
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                API key (optional)
              </span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Set when provider requires it"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Base URL (optional)
              </span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Default model</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder="gpt-4o-mini"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  onSkipProvider?.();
                  void handleRefresh();
                }}
              >
                Skip for now
              </Button>
              <Button disabled={submitting} onClick={submitProvider}>
                {submitting ? "Saving..." : "Save provider"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={cn("text-xs", message ? "text-foreground" : "text-muted-foreground")}>
          {message || error || (loading ? "Loading setup state..." : "")}
        </div>
      </div>
    </div>
  );
};

export default SetupGate;
