const LOCAL_BACKEND_PORT = '3001';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const formatHostname = (hostname: string): string => (
  hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname
);

export const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== LOCAL_BACKEND_PORT;
};

export const getLocalBackendOrigin = (): string => {
  if (typeof window === 'undefined') {
    return `http://localhost:${LOCAL_BACKEND_PORT}`;
  }

  return `${window.location.protocol}//${formatHostname(window.location.hostname)}:${LOCAL_BACKEND_PORT}`;
};

export const normalizeLocalBackendBase = (base: string): string => {
  const trimmed = base.trim().replace(/\/$/, '');
  if (typeof window === 'undefined' || !trimmed || !isLocalAdminDevHost()) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (LOCAL_HOSTNAMES.has(url.hostname) && url.port === LOCAL_BACKEND_PORT) {
      url.protocol = window.location.protocol;
      url.hostname = window.location.hostname;
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return trimmed;
  }

  return trimmed;
};
