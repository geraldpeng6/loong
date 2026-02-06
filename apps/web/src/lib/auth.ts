const STORAGE_KEY = "loong_password";

export const setLoongPassword = (password: string) => {
  if (typeof window === "undefined") return;
  try {
    const trimmed = String(password || "").trim();
    if (!trimmed) return;
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // ignore storage errors
  }
};

export const clearLoongPassword = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export const getLoongPassword = (): string => {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const queryPassword = url.searchParams.get("password");
  if (queryPassword && queryPassword.trim()) {
    const trimmed = queryPassword.trim();
    setLoongPassword(trimmed);
    url.searchParams.delete("password");
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
    return trimmed;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? stored.trim() : "";
  } catch {
    return "";
  }
};

export const appendAuthQuery = (url: URL): URL => {
  const password = getLoongPassword();
  if (password) {
    url.searchParams.set("password", password);
  }
  return url;
};

export const getAuthHeaders = (): Record<string, string> => {
  const password = getLoongPassword();
  if (!password) return {};
  return { "x-loong-password": password };
};
