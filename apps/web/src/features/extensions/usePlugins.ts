import { useCallback, useEffect, useState } from "react";

import { appendAuthQuery, getAuthHeaders } from "@/lib/auth";

export type PluginStatus = {
  id: string;
  name?: string;
  description?: string;
  enabled: boolean;
};

type PluginsResponse = { success?: boolean; error?: string; plugins?: PluginStatus[] };

type UsePluginsResult = {
  plugins: PluginStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export const usePlugins = (): UsePluginsResult => {
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    const url = new URL("/api/plugins", window.location.href);
    appendAuthQuery(url);
    setLoading(true);
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (response.status === 404) {
        setPlugins([]);
        setError(null);
        return;
      }

      const raw = await response.text();
      let data: PluginsResponse | null = null;
      try {
        data = raw ? (JSON.parse(raw) as PluginsResponse) : null;
      } catch {
        data = null;
      }

      if (!response.ok || data?.success === false) {
        const message = data?.error || response.statusText || "plugins unavailable";
        setError(message);
        return;
      }

      if (data?.plugins) {
        setPlugins(data.plugins);
        setError(null);
      } else {
        setPlugins([]);
        setError("plugins unavailable");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void request();
  }, [request]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { plugins, loading, error, refresh };
};
