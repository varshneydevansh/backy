const AUTH_STORAGE_KEY = 'backy-auth-storage';

let liveAdminSessionToken = '';

export const setActiveAdminSessionToken = (token?: string | null): void => {
  liveAdminSessionToken = typeof token === 'string' ? token.trim() : '';
};

export const clearActiveAdminSessionToken = (): void => {
  liveAdminSessionToken = '';
};

const readPersistedAdminSessionToken = (): string => {
  if (typeof window === 'undefined') return '';

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';

    const parsed = JSON.parse(raw) as {
      state?: {
        session?: {
          token?: unknown;
        } | null;
      };
    };
    const token = parsed.state?.session?.token;
    return typeof token === 'string' ? token.trim() : '';
  } catch {
    return '';
  }
};

export const getActiveAdminSessionToken = (): string => (
  liveAdminSessionToken || readPersistedAdminSessionToken()
);
