import { useCallback, useEffect, useState } from "react";

import { appendAuthQuery, getAuthHeaders } from "@/lib/auth";

type AudioPipelineStatus = {
  enabled: boolean;
  running: boolean;
  pids: number[];
  pipelineDir: string;
  inputDirs: string[];
  outputDir: string;
  watchCmd: string;
  watchArgs: string[];
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
};

type PipelineResponse = AudioPipelineStatus & { success?: boolean; error?: string };

type UseAudioPipelineResult = {
  status: AudioPipelineStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  updateConfig: (config: {
    inputDirs?: string[];
    outputDir?: string;
    pipelineDir?: string;
  }) => Promise<void>;
};

export const useAudioPipeline = (): UseAudioPipelineResult => {
  const [status, setStatus] = useState<AudioPipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (method: "GET" | "POST", payload?: Record<string, unknown>) => {
    const url = new URL("/api/audio-pipeline/status", window.location.href);
    appendAuthQuery(url);
    setLoading(true);
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          "content-type": "application/json",
          ...getAuthHeaders(),
        },
        body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
      });

      if (response.status === 404) {
        setStatus(null);
        setError(null);
        return;
      }

      const raw = await response.text();
      let data: PipelineResponse | null = null;
      try {
        data = raw ? (JSON.parse(raw) as PipelineResponse) : null;
      } catch {
        data = null;
      }

      if (!response.ok || data?.success === false) {
        const message = data?.error || response.statusText || "audio-pipeline unavailable";
        setError(message);
        return;
      }

      if (data) {
        setStatus(data);
        setError(null);
      } else {
        setStatus(null);
        setError("audio-pipeline unavailable");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void request("GET");
  }, [request]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await request("POST", { enabled });
    },
    [request],
  );

  const updateConfig = useCallback(
    async (config: { inputDirs?: string[]; outputDir?: string; pipelineDir?: string }) => {
      await request("POST", config);
    },
    [request],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, loading, error, refresh, setEnabled, updateConfig };
};
