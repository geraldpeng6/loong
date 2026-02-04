import { useCallback, useEffect, useState } from "react";

import type {
  ModelsConfig,
  ProviderAuthStatus,
  ProviderCatalog,
  ProviderConfig,
} from "@/types/modelRegistry";
import { getAuthHeaders } from "@/lib/auth";

export type ModelRegistryState = {
  catalog: ProviderCatalog[];
  config: ModelsConfig;
  auth: Record<string, ProviderAuthStatus>;
  loading: boolean;
  error: string | null;
};

const initialState: ModelRegistryState = {
  catalog: [],
  config: { providers: {} },
  auth: {},
  loading: false,
  error: null,
};

export const useModelRegistry = () => {
  const [state, setState] = useState<ModelRegistryState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/models/registry", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to load registry (${response.status})`);
      }
      const data = await response.json();
      setState((prev) => ({
        ...prev,
        catalog: data.providers || [],
        config: data.config || { providers: {} },
        auth: data.auth || {},
        loading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load registry",
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertProvider = useCallback(async (providerId: string, provider: ProviderConfig) => {
    const response = await fetch("/api/models/config", {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ providerId, provider }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to save provider (${response.status})`);
    }
    const payload = await response.json();
    setState((prev) => ({
      ...prev,
      config: payload.config || prev.config,
    }));
    return payload;
  }, []);

  return {
    state,
    refresh,
    upsertProvider,
  };
};
