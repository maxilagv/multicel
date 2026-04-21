const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';
const API_BASE_KEY = 'app.apiBase';
const APP_MODE_KEY = 'app.mode';

export type AppMode = 'owner' | 'employee';

export function saveTokens(accessToken: string, refreshToken: string, remember: boolean) {
  clearTokens();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(ACCESS_KEY, accessToken);
  storage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return (
    localStorage.getItem(ACCESS_KEY) ||
    sessionStorage.getItem(ACCESS_KEY)
  );
}

export function getRefreshToken(): string | null {
  return (
    localStorage.getItem(REFRESH_KEY) ||
    sessionStorage.getItem(REFRESH_KEY)
  );
}

export function normalizeApiBase(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
}

export function setApiBase(base: string | null) {
  if (!base) {
    localStorage.removeItem(API_BASE_KEY);
    return;
  }
  const normalized = normalizeApiBase(base);
  if (normalized) {
    localStorage.setItem(API_BASE_KEY, normalized);
  }
}

export function clearApiBase() {
  localStorage.removeItem(API_BASE_KEY);
}

export function getStoredApiBase(): string | null {
  return localStorage.getItem(API_BASE_KEY);
}

export function getApiBase(): string {
  const envBase =
    import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
  const isHttpsPage =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (import.meta.env.DEV && envBase) {
    if (!(isHttpsPage && /^http:\/\//i.test(envBase))) {
      return envBase;
    }
  }

  const stored = getStoredApiBase();
  if (stored) {
    if (!(isHttpsPage && /^http:\/\//i.test(stored))) {
      return stored;
    }
  }

  if (envBase) {
    if (!(isHttpsPage && /^http:\/\//i.test(envBase))) {
      return envBase;
    }
  }
  const isFile =
    typeof window !== 'undefined' && window.location.protocol === 'file:';
  return isFile ? 'http://127.0.0.1:3000' : '';
}

export function setAppMode(mode: AppMode | null) {
  if (!mode) {
    localStorage.removeItem(APP_MODE_KEY);
    return;
  }
  if (mode === 'owner' || mode === 'employee') {
    localStorage.setItem(APP_MODE_KEY, mode);
  }
}

export function getAppMode(): AppMode | null {
  const raw = localStorage.getItem(APP_MODE_KEY);
  return raw === 'owner' || raw === 'employee' ? raw : null;
}

export function clearAppMode() {
  localStorage.removeItem(APP_MODE_KEY);
}
