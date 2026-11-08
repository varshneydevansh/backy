// Release checks use names only for remote metadata; values stay server-side.
export const ADMIN_TRUSTED_ORIGINS_ENV = 'BACKY_ADMIN_TRUSTED_ORIGINS';
export const CLIENT_ADMIN_TRUSTED_ORIGINS_ENV_NAMES = Object.freeze([
  'NEXT_PUBLIC_BACKY_ADMIN_TRUSTED_ORIGINS',
  'VITE_BACKY_ADMIN_TRUSTED_ORIGINS',
]);

export function adminOriginProjectEnvPolicy(app) {
  return {
    required: app === 'backy-public' ? [ADMIN_TRUSTED_ORIGINS_ENV] : [],
    forbidden: app === 'backy-public'
      ? [...CLIENT_ADMIN_TRUSTED_ORIGINS_ENV_NAMES]
      : [ADMIN_TRUSTED_ORIGINS_ENV, ...CLIENT_ADMIN_TRUSTED_ORIGINS_ENV_NAMES],
  };
}

export function outputContainsEnvName(output, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9_])${escaped}([^A-Z0-9_]|$)`, 'u').test(output);
}

// Keep strict identity parsing aligned with admin-auth/cookieWriteOrigin.ts.
// Do not silently discard invalid list entries or turn URLs into origin prefixes.
function strictOrigin(value) {
  if (!/^https?:\/\/[^/?#\s]+$/i.test(value) || value.includes('*') || value.includes('\\')) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.origin !== 'null'
      ? url.origin : null;
  } catch { return null; }
}

export function validateAdminOriginProductionEnv(env) {
  const failures = [];
  const raw = typeof env[ADMIN_TRUSTED_ORIGINS_ENV] === 'string' ? env[ADMIN_TRUSTED_ORIGINS_ENV].trim() : '';
  const origins = raw.split(',').map((entry) => strictOrigin(entry.trim()));
  if (!raw) {
    failures.push(`${ADMIN_TRUSTED_ORIGINS_ENV} must be configured`);
  } else if (origins.some((origin) => !origin)) {
    failures.push(`${ADMIN_TRUSTED_ORIGINS_ENV} must contain only nonempty exact HTTP(S) origins without paths, credentials, wildcards, query strings, or fragments`);
  }

  const appUrl = typeof env.NEXT_PUBLIC_BACKY_ADMIN_APP_URL === 'string' ? env.NEXT_PUBLIC_BACKY_ADMIN_APP_URL.trim() : '';
  if (appUrl) {
    let adminOrigin = null;
    try {
      const url = new URL(appUrl);
      if (!/[\s\\*]/.test(appUrl) && /^https?:\/\//i.test(appUrl) && !url.username && !url.password) {
        adminOrigin = strictOrigin(url.origin);
      }
    } catch { /* Report the key only; never print its value. */ }
    if (!adminOrigin) {
      failures.push('NEXT_PUBLIC_BACKY_ADMIN_APP_URL must be a valid HTTP(S) URL without credentials');
    } else if (raw && !origins.includes(adminOrigin)) {
      failures.push(`${ADMIN_TRUSTED_ORIGINS_ENV} must include the origin of NEXT_PUBLIC_BACKY_ADMIN_APP_URL`);
    }
  }

  for (const key of CLIENT_ADMIN_TRUSTED_ORIGINS_ENV_NAMES) {
    // Presence, including an empty value, is a project-boundary violation.
    if (Object.prototype.hasOwnProperty.call(env, key)) failures.push(`${key} must not be configured; use server-only ${ADMIN_TRUSTED_ORIGINS_ENV}`);
  }
  return failures;
}
