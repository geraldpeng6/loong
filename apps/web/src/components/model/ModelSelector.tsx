import { useEffect, useMemo, useState } from "react";

import BulbSvg from "@/components/ui/bulb-svg";
import EyeIcon from "@/components/ui/eye-icon";
import PenIcon from "@/components/ui/pen-icon";
import UserPlusIcon from "@/components/ui/user-plus-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AvailableModel, ModelState } from "@/types/gateway";
import type {
  ModelsConfig,
  ModelEntry,
  ProviderAuthStatus,
  ProviderCatalog,
  ProviderConfig,
} from "@/types/modelRegistry";
import CustomProviderDialog, { CustomProviderForm } from "@/components/model/CustomProviderDialog";

export type ModelSelectorProps = {
  availableModels: AvailableModel[];
  currentModel: ModelState | null;
  catalog: ProviderCatalog[];
  config: ModelsConfig;
  auth: Record<string, ProviderAuthStatus>;
  onSetModel: (provider: string, modelId: string) => void;
  onAddProvider: (providerId: string, provider: ProviderConfig) => Promise<void>;
  onRefreshModels: () => void;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

const matchesQuery = (query: string, ...values: Array<string | null | undefined>) => {
  if (!query.trim()) return true;
  const normalized = query.toLowerCase();
  return values.some((value) => value && value.toLowerCase().includes(normalized));
};

const formatTokens = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  const kValue = Math.floor(value / 100) / 10;
  const formatted = kValue % 1 === 0 ? kValue.toFixed(0) : kValue.toFixed(1);
  return `${formatted}k`;
};

const ModelSelector = ({
  availableModels,
  currentModel,
  catalog,
  config,
  auth,
  onSetModel,
  onAddProvider,
  onRefreshModels,
}: ModelSelectorProps) => {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(
    currentModel?.provider ?? null,
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(currentModel?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");

  useEffect(() => {
    setSelectedProvider(currentModel?.provider ?? null);
    setSelectedModel(currentModel?.id ?? null);
  }, [currentModel?.id, currentModel?.provider]);

  useEffect(() => {
    if (selectorOpen) {
      setProviderQuery("");
      setModelQuery("");
    }
  }, [selectorOpen]);

  const availableProviderSet = useMemo(() => {
    return new Set(availableModels.map((model) => model.provider));
  }, [availableModels]);

  const availableModelMap = useMemo(() => {
    return new Map(availableModels.map((model) => [`${model.provider}:${model.id}`, model]));
  }, [availableModels]);

  const configProviders = useMemo(() => config.providers || {}, [config.providers]);

  const providers = useMemo<ProviderCatalog[]>(() => {
    const catalogIds = new Set(catalog.map((provider) => provider.id));
    const custom = Object.entries(configProviders)
      .filter(([id]) => !catalogIds.has(id))
      .map(([id, provider]) => ({
        id,
        name: id,
        description: "Custom provider",
        models: provider.models || [],
      }));

    return [...catalog, ...custom];
  }, [catalog, configProviders]);

  const providerMap = useMemo(() => {
    return new Map(providers.map((provider) => [provider.id, provider]));
  }, [providers]);

  const provider = selectedProvider ? providerMap.get(selectedProvider) : null;
  const providerConfig = selectedProvider ? configProviders[selectedProvider] : null;
  const providerAvailable = selectedProvider ? availableProviderSet.has(selectedProvider) : false;
  const authStatus = selectedProvider ? auth[selectedProvider] : null;
  const providerConfigured =
    providerAvailable ||
    Boolean(providerConfig) ||
    Boolean(authStatus?.hasEnv) ||
    Boolean(authStatus?.hasConfigKey);

  const providerModels = useMemo<ModelEntry[]>(() => {
    if (providerConfig?.models && providerConfig.models.length > 0) {
      return providerConfig.models;
    }
    return provider?.models || [];
  }, [provider, providerConfig]);

  const visibleModels = useMemo<Array<ModelEntry | AvailableModel>>(() => {
    if (!selectedProvider) return [];
    if (providerModels.length > 0) return providerModels;
    return availableModels.filter((model) => model.provider === selectedProvider);
  }, [availableModels, providerModels, selectedProvider]);

  const filteredProviders = useMemo(() => {
    return providers.filter((entry) =>
      matchesQuery(providerQuery, entry.id, entry.name, entry.description),
    );
  }, [providers, providerQuery]);

  const filteredModels = useMemo(() => {
    return visibleModels.filter((entry) => matchesQuery(modelQuery, entry.id, entry.name));
  }, [modelQuery, visibleModels]);

  const detailModels = useMemo(() => {
    if (!selectedProvider) return [] as Array<ModelEntry | AvailableModel>;
    return filteredModels.map((model) => {
      const available = availableModelMap.get(`${selectedProvider}:${model.id}`);
      const merged = available ? { ...model, ...available } : model;
      return {
        ...merged,
        id: model.id,
        name: model.name || merged.name || model.id,
        provider: selectedProvider,
      };
    });
  }, [availableModelMap, filteredModels, selectedProvider]);

  const quickModels = useMemo(() => {
    if (!selectedProvider) return [] as Array<{ id: string; name: string }>;
    const items = visibleModels.map((model) => {
      const available = availableModelMap.get(`${selectedProvider}:${model.id}`);
      return {
        id: model.id,
        name: model.name || available?.name || model.id,
      };
    });
    if (selectedModel && !items.some((entry) => entry.id === selectedModel)) {
      items.unshift({ id: selectedModel, name: selectedModel });
    }
    return items;
  }, [availableModelMap, selectedModel, selectedProvider, visibleModels]);

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    setSelectedModel(null);
    setPendingConfig(false);
    setModelQuery("");
  };

  const handleModelChange = (value: string) => {
    if (!selectedProvider) return;
    if (value === "__custom__") {
      const customModel = window.prompt("Enter model name");
      if (customModel) {
        setSelectedModel(customModel);
        setPendingConfig(true);
      }
      return;
    }

    const key = `${selectedProvider}:${value}`;
    const available = availableModelMap.has(key);
    setSelectedModel(value);
    if (available) {
      onSetModel(selectedProvider, value);
      setPendingConfig(false);
    } else {
      setPendingConfig(true);
      setSelectorOpen(true);
    }
  };

  const handleAddProvider = async (form: CustomProviderForm) => {
    const providerId = slugify(form.name);
    const provider: ProviderConfig = {
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      api: "openai-completions",
      models: form.defaultModel ? [{ id: form.defaultModel }] : [],
    };

    await onAddProvider(providerId, provider);
    setDialogOpen(false);
    setSelectedProvider(providerId);
    setSelectedModel(form.defaultModel || null);
    setPendingConfig(true);
    setTimeout(onRefreshModels, 1200);
  };

  const configNotice = useMemo(() => {
    if (!selectedProvider) return null;
    if (pendingConfig) {
      return {
        title: "Model not available for this provider.",
        description:
          "The selected model isn't ready on the server yet. Add it to the provider config or refresh after updating credentials.",
        steps: [
          "Use “Add custom provider” to set API key/base URL and the model list.",
          "Or edit ~/.pi/agent/models.json on the server, then restart Loong.",
        ],
      };
    }
    if (!providerConfigured) {
      const envVars = (authStatus?.envVars || []).filter(Boolean);
      const steps = [] as string[];
      if (envVars.length > 0) {
        steps.push(`Set ${envVars.join(" / ")} on the server and restart Loong.`);
      } else {
        steps.push("Set the provider credentials on the server and restart Loong.");
      }
      if (authStatus?.loginHint) {
        steps.push(authStatus.loginHint);
      }
      steps.push("Use “Add custom provider” to set API key/base URL.");
      steps.push("Or edit ~/.pi/agent/models.json on the server, then restart Loong.");

      return {
        title: "Provider not configured.",
        description: "This provider is missing credentials on the server.",
        steps,
      };
    }
    return null;
  }, [authStatus, pendingConfig, providerConfigured, selectedProvider]);

  const showConfigNotice = Boolean(configNotice);
  const quickDisabled = !selectedProvider || quickModels.length === 0;

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Select
          value={selectedModel ?? ""}
          onValueChange={handleModelChange}
          disabled={quickDisabled}
        >
          <SelectTrigger
            className="h-8 w-auto max-w-[160px] min-w-0 border-none bg-transparent px-0 py-0 text-xs font-medium shadow-none focus:ring-0 focus:ring-offset-0 sm:max-w-[240px] sm:text-sm"
            aria-label="Select model"
          >
            <SelectValue placeholder="Select model" className="truncate" />
          </SelectTrigger>
          <SelectContent
            side="bottom"
            align="start"
            sideOffset={4}
            avoidCollisions={false}
            className="min-w-[200px] bg-background/95 shadow-lg backdrop-blur sm:min-w-[240px]"
          >
            {quickModels.map((model) => (
              <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                {model.name}
              </SelectItem>
            ))}
            {quickModels.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No models available.</div>
            ) : null}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSelectorOpen(true)}
          aria-label="Change model"
        >
          <PenIcon size={14} />
        </Button>
      </div>

      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Model selection</DialogTitle>
          </DialogHeader>

          {showConfigNotice && configNotice ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">{configNotice.title}</div>
              <div className="mt-1 text-muted-foreground">{configNotice.description}</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {configNotice.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Provider
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Filter providers"
                value={providerQuery}
                onChange={(event) => setProviderQuery(event.target.value)}
                aria-label="Filter providers"
              />
              <div className="max-h-60 overflow-y-auto rounded-md border bg-background">
                {filteredProviders.map((item) => {
                  const authEntry = auth[item.id];
                  const configured =
                    availableProviderSet.has(item.id) ||
                    Boolean(configProviders[item.id]) ||
                    Boolean(authEntry?.hasEnv) ||
                    Boolean(authEntry?.hasConfigKey);
                  const selected = item.id === selectedProvider;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
                        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                      )}
                      onClick={() => handleProviderChange(item.id)}
                    >
                      <span>{item.name}</span>
                      {configured ? <span className="text-[10px]">✓</span> : null}
                    </button>
                  );
                })}
                {filteredProviders.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No providers found.</div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={() => setDialogOpen(true)}
              >
                <UserPlusIcon size={14} />
                Add custom provider
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Model
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={selectedProvider ? "Filter models" : "Select a provider first"}
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                disabled={!selectedProvider}
                aria-label="Filter models"
              />
              <div className="max-h-60 overflow-y-auto rounded-md border bg-background">
                {!selectedProvider ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Select a provider to see models.
                  </div>
                ) : null}
                {selectedProvider
                  ? detailModels.map((model) => {
                      const selected = model.id === selectedModel;
                      const name = model.name || model.id;
                      const inputTypes = model.input ?? [];
                      const vision = inputTypes.includes("image");
                      const reasoning = Boolean(model.reasoning);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center px-3 py-2 text-sm transition-colors",
                            selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                          )}
                          onClick={() => handleModelChange(model.id)}
                        >
                          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_64px_64px] items-center gap-3">
                            <span className="truncate text-left" title={name}>
                              {name}
                            </span>
                            <span className="flex items-center gap-1">
                              <EyeIcon
                                size={14}
                                className={cn(
                                  vision ? "text-emerald-500" : "text-muted-foreground/40",
                                )}
                              />
                              <BulbSvg
                                size={14}
                                className={cn(
                                  reasoning ? "text-emerald-500" : "text-muted-foreground/40",
                                )}
                              />
                            </span>
                            <span className="text-right text-[10px] uppercase text-muted-foreground">
                              Ctx {formatTokens(model.contextWindow)}
                            </span>
                            <span className="text-right text-[10px] uppercase text-muted-foreground">
                              Out {formatTokens(model.maxTokens)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  : null}
                {selectedProvider && detailModels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No models found.</div>
                ) : null}
              </div>
              {selectedProvider && configProviders[selectedProvider] ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
                  onClick={() => handleModelChange("__custom__")}
                >
                  Enter model name…
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CustomProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleAddProvider}
      />
    </>
  );
};

export default ModelSelector;
