import { useCallback, useEffect, useState } from "react";

import { clearLoongPassword, getAuthHeaders, setLoongPassword } from "@/lib/auth";

export type SetupStatus = {
  auth: {
    required: boolean;
    mode: "none" | "env" | "file";
    canRegister: boolean;
    username: string | null;
    authorized: boolean;
  };
  models: {
    configuredProviderCount: number;
    configuredModelCount: number;
    hasConfiguredProvider: boolean;
    hasConfiguredModel: boolean;
  };
};

type SetupState = {
  loading: boolean;
  error: string | null;
  status: SetupStatus | null;
};

const initialState: SetupState = {
  loading: false,
  error: null,
  status: null,
};

const getErrorText = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  return payload?.error || fallback;
};

export const useSetup = () => {
  const [state, setState] = useState<SetupState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/setup/status", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(
          await getErrorText(response, `Failed to load setup status (${response.status})`),
        );
      }
      const status = (await response.json()) as SetupStatus;
      setState({ loading: false, error: null, status });
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load setup status";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (password: string) => {
      const trimmed = String(password || "").trim();
      if (!trimmed) {
        throw new Error("Password is required");
      }
      setLoongPassword(trimmed);
      const status = await refresh();
      if (!status.auth.required || status.auth.authorized) {
        return status;
      }
      clearLoongPassword();
      throw new Error("Invalid password");
    },
    [refresh],
  );

  const register = useCallback(
    async ({ username, password }: { username: string; password: string }) => {
      const response = await fetch("/api/setup/register", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error(await getErrorText(response, `Failed to register (${response.status})`));
      }
      setLoongPassword(password);
      return refresh();
    },
    [refresh],
  );

  const updatePassword = useCallback(
    async ({
      currentPassword,
      nextPassword,
      username,
    }: {
      currentPassword?: string;
      nextPassword: string;
      username?: string;
    }) => {
      const response = await fetch("/api/setup/password", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, nextPassword, username }),
      });
      if (!response.ok) {
        throw new Error(
          await getErrorText(response, `Failed to update password (${response.status})`),
        );
      }
      setLoongPassword(nextPassword);
      return refresh();
    },
    [refresh],
  );

  return {
    state,
    refresh,
    login,
    register,
    updatePassword,
  };
};
