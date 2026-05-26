#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_LOGIN_CDP_PORT || 9392);
const SOURCE_ONLY_MODE = process.env.BACKY_LOGIN_SOURCE_ONLY === '1'
  || process.env.BACKY_AUTH_SOURCE_ONLY === '1'
  || process.env.BACKY_LOGIN_SMOKE_SOURCE_ONLY === '1';
const LOGIN_FORM_STATUS_SMOKE = process.env.BACKY_LOGIN_FORM_STATUS_SMOKE === '1';
const SIDEBAR_CREATE_SMOKE = process.env.BACKY_LOGIN_SIDEBAR_CREATE_SMOKE === '1'
  || process.env.BACKY_SIDEBAR_CREATE_SMOKE === '1';
const ADMIN_MFA_CODE = process.env.BACKY_LOGIN_SMOKE_MFA_CODE || process.env.BACKY_ADMIN_MFA_CODE || process.env.BACKY_ADMIN_2FA_CODE || 'backy-dev-mfa';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
  return response.json();
};

const adminLoginBody = (twoFactorCode = '') => JSON.stringify({
  email: 'admin@backy.io',
  password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
  ...(twoFactorCode ? { twoFactorCode } : {}),
});

const loginAdminApi = async () => {
  let response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: adminLoginBody(),
  });
  let payload = await response.json().catch(() => ({}));
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && ADMIN_MFA_CODE) {
    response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: adminLoginBody(ADMIN_MFA_CODE),
    });
    payload = await response.json().catch(() => ({}));
  }
  return { response, payload };
};

const assertEditorCanReadOwnPermissionMatrix = async () => {
  let loginResponse = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'jane@backy.io',
      password: process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123',
    }),
  });
  let loginPayload = await loginResponse.json().catch(() => ({}));
  if (!loginResponse.ok && loginPayload.error?.code === 'MFA_REQUIRED' && ADMIN_MFA_CODE) {
    loginResponse = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'jane@backy.io',
        password: process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123',
        twoFactorCode: ADMIN_MFA_CODE,
      }),
    });
    loginPayload = await loginResponse.json().catch(() => ({}));
  }
  assert(
    loginResponse.ok && loginPayload.success !== false && loginPayload.data?.session?.token && loginPayload.data?.user?.id,
    `Editor login failed: ${JSON.stringify(loginPayload).slice(0, 500)}`,
  );

  const token = loginPayload.data.session.token;
  const userId = loginPayload.data.user.id;
  const ownPermissionsResponse = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/permissions`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const ownPermissionsPayload = await ownPermissionsResponse.json().catch(() => ({}));
  assert(
    ownPermissionsResponse.ok && ownPermissionsPayload.data?.permissions?.userId === userId,
    `Editor should be able to read own permissions, got ${ownPermissionsResponse.status}: ${JSON.stringify(ownPermissionsPayload).slice(0, 500)}`,
  );

  const matrixRules = ownPermissionsPayload.data.permissions.groups.flatMap((group) => group.permissions || []);
  assert(
    matrixRules.some((permission) => permission.key === 'pages.view' && permission.allowed),
    `Editor own permissions should include pages.view: ${JSON.stringify(ownPermissionsPayload.data.permissions).slice(0, 500)}`,
  );

  const otherPermissionsResponse = await fetch(`${API_BASE_URL}/api/admin/users/user-admin/permissions`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const otherPermissionsPayload = await otherPermissionsResponse.json().catch(() => ({}));
  assert(
    otherPermissionsResponse.status === 403 && otherPermissionsPayload.error?.code === 'FORBIDDEN_PERMISSION',
    `Editor should not read another user's permissions, got ${otherPermissionsResponse.status}: ${JSON.stringify(otherPermissionsPayload).slice(0, 500)}`,
  );
};

const assertHttpOnlySessionCookieFlow = async () => {
  const { response: loginResponse, payload: loginPayload } = await loginAdminApi();
  const setCookie = loginResponse.headers.get('set-cookie') || '';
  assert(
    loginResponse.ok && loginPayload.success !== false && loginPayload.data?.session?.token,
    `Admin login for cookie flow failed: ${JSON.stringify(loginPayload).slice(0, 500)}`,
  );
  assert(
    setCookie.includes('backy_admin_session=') &&
      /HttpOnly/i.test(setCookie) &&
      /SameSite=Lax/i.test(setCookie),
    `Login response did not set an httpOnly lax session cookie: ${setCookie}`,
  );
  const cookieHeader = setCookie.split(';')[0];

  const sessionResponse = await fetch(`${API_BASE_URL}/api/admin/auth/session`, {
    headers: { cookie: cookieHeader },
  });
  const sessionPayload = await sessionResponse.json().catch(() => ({}));
  assert(
    sessionResponse.ok &&
      sessionPayload.success !== false &&
      sessionPayload.data?.user?.email === 'admin@backy.io' &&
      sessionPayload.data?.session?.token === loginPayload.data.session.token,
    `Cookie-only session lookup failed: ${sessionResponse.status} ${JSON.stringify(sessionPayload).slice(0, 500)}`,
  );

  const logoutResponse = await fetch(`${API_BASE_URL}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
  const logoutPayload = await logoutResponse.json().catch(() => ({}));
  const logoutCookie = logoutResponse.headers.get('set-cookie') || '';
  assert(
    logoutResponse.ok && logoutPayload.data?.revoked === true && /Max-Age=0/i.test(logoutCookie),
    `Cookie logout did not revoke and clear the session: ${JSON.stringify({ logoutPayload, logoutCookie }).slice(0, 500)}`,
  );

  const revokedSessionResponse = await fetch(`${API_BASE_URL}/api/admin/auth/session`, {
    headers: { cookie: cookieHeader },
  });
  const revokedPayload = await revokedSessionResponse.json().catch(() => ({}));
  assert(
    revokedSessionResponse.status === 401 && revokedPayload.error?.code === 'UNAUTHORIZED',
    `Revoked cookie session should be unauthorized, got ${revokedSessionResponse.status}: ${JSON.stringify(revokedPayload).slice(0, 500)}`,
  );
};

const assertAuthAuditEvents = async () => {
  const { response: loginResponse, payload: loginPayload } = await loginAdminApi();
  assert(
    loginResponse.ok && loginPayload.data?.session?.token,
    `Admin login for auth audit readback failed: ${JSON.stringify(loginPayload).slice(0, 500)}`,
  );

  const auditResponse = await fetch(`${API_BASE_URL}/api/admin/audit-logs?entity=settings&entityId=platform&limit=50`, {
    headers: { authorization: `Bearer ${loginPayload.data.session.token}` },
  });
  const auditPayload = await auditResponse.json().catch(() => ({}));
  const logs = auditPayload.data?.logs || [];
  assert(
    auditResponse.ok && logs.some((log) => (
      log.action === 'auth.login.success' &&
      log.metadata?.email === 'admin@backy.io' &&
      log.metadata?.authMode === 'local-demo'
    )),
    `Auth login success audit event was not recorded: ${JSON.stringify(auditPayload).slice(0, 1000)}`,
  );
  assert(
    logs.some((log) => (
      log.action === 'auth.logout' &&
      log.metadata?.email === 'admin@backy.io' &&
      log.metadata?.revoked === true
    )),
    `Auth logout audit event was not recorded: ${JSON.stringify(auditPayload).slice(0, 1000)}`,
  );
};

const assertAuthRecoverySource = () => {
  const loginSource = fs.readFileSync(new URL('../src/routes/login.tsx', import.meta.url), 'utf8');
  const forgotSource = fs.readFileSync(new URL('../src/routes/forgot-password.tsx', import.meta.url), 'utf8');
  const resetSource = fs.readFileSync(new URL('../src/routes/reset-password.tsx', import.meta.url), 'utf8');
  const localBackendOriginSource = fs.readFileSync(new URL('../src/lib/localBackendOrigin.ts', import.meta.url), 'utf8');
  const adminSessionTokenSource = fs.readFileSync(new URL('../src/lib/adminSessionToken.ts', import.meta.url), 'utf8');
  const adminAuthApiSource = fs.readFileSync(new URL('../src/lib/adminAuthApi.ts', import.meta.url), 'utf8');
  const adminContentApiSource = fs.readFileSync(new URL('../src/lib/adminContentApi.ts', import.meta.url), 'utf8');
  const mediaApiSource = fs.readFileSync(new URL('../src/lib/mediaApi.ts', import.meta.url), 'utf8');
  const authStoreSource = fs.readFileSync(new URL('../src/stores/authStore.ts', import.meta.url), 'utf8');
  const rootRouteSource = fs.readFileSync(new URL('../src/routes/__root.tsx', import.meta.url), 'utf8');
  const mainLayoutSource = fs.readFileSync(new URL('../src/components/layout/MainLayout.tsx', import.meta.url), 'utf8');
  const sidebarSource = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
  const headerSource = fs.readFileSync(new URL('../src/components/layout/Header.tsx', import.meta.url), 'utf8');
  const permissionSource = fs.readFileSync(new URL('../src/lib/adminPermissionUi.ts', import.meta.url), 'utf8');
  const navigationAccessSource = fs.readFileSync(new URL('../src/lib/adminNavigationAccess.ts', import.meta.url), 'utf8');
  const loginSmokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');

  assert(
    loginSource.includes('autoComplete="username"') &&
      loginSource.includes('autoComplete="current-password"') &&
      loginSource.includes('inputMode="text"') &&
      loginSource.includes('autoComplete="one-time-code"') &&
      loginSource.includes('autoCapitalize="none"') &&
      loginSource.includes('spellCheck={false}') &&
      loginSource.includes("const DEMO_MFA_CODE = 'backy-dev-mfa';") &&
      loginSource.includes('Authenticator code or MFA phrase') &&
      loginSource.includes('Two-factor code or workspace MFA phrase is required') &&
      loginSource.includes('Seeded demo MFA:'),
    'Login page must expose browser autocomplete hints and treat MFA as a string-capable workspace code, not a numeric-only OTP field.',
  );
  assert(
    loginSource.includes("const loginActionStatusId = 'login-action-status';") &&
      loginSource.includes('data-testid="login-form"') &&
      loginSource.includes('data-testid="login-action-status"') &&
      loginSource.includes('data-testid="login-email-input"') &&
      loginSource.includes('data-testid="login-password-input"') &&
      loginSource.includes('data-testid="login-submit"') &&
      loginSource.includes('data-testid={`login-demo-${account.label.toLowerCase()}`}') &&
      loginSource.includes('data-action-state={loginActionState}') &&
      loginSource.includes('data-action-status={loginActionStatus}') &&
      loginSource.includes("aria-describedby={emailDescription}") &&
      loginSource.includes("aria-describedby={passwordDescription}") &&
      loginSource.includes("aria-describedby={mfaDescription}") &&
      loginSource.includes('Enter a valid email and password to sign in.') &&
      loginSource.includes('Enter your workspace MFA code or phrase to finish signing in.'),
    'Login form must expose a shared action status, stable control hooks, and described input errors for sign-in, MFA, and demo account selection.',
  );

  assert(
    forgotSource.includes('data-testid="forgot-password-form"') &&
      forgotSource.includes('noValidate') &&
      forgotSource.includes('recoverySubmitted') &&
      forgotSource.includes('emailInlineError') &&
      forgotSource.includes('data-testid="forgot-password-email-input"') &&
      forgotSource.includes('aria-invalid={Boolean(emailInlineError)}') &&
      forgotSource.includes('aria-describedby={emailInlineError ?') &&
      forgotSource.includes('data-testid="forgot-password-email-error"') &&
      forgotSource.includes('role={recoveryState ===') &&
      forgotSource.includes('data-testid="forgot-password-message"') &&
      forgotSource.includes('disabled={isSubmitting}') &&
      !forgotSource.includes('disabled={!emailIsValid || isSubmitting}'),
    'Forgot password page must expose custom inline email validation and keep the recovery action reachable for invalid submissions',
  );

  assert(
    resetSource.includes('data-testid="reset-password-form"') &&
      resetSource.includes('noValidate') &&
      resetSource.includes('resetSubmitted') &&
      resetSource.includes('tokenInlineError') &&
      resetSource.includes('passwordInlineError') &&
      resetSource.includes('confirmInlineError') &&
      resetSource.includes('data-testid="reset-password-token-error"') &&
      resetSource.includes('data-testid="reset-password-new-input"') &&
      resetSource.includes('aria-invalid={Boolean(passwordInlineError)}') &&
      resetSource.includes('id="reset-password-requirement"') &&
      resetSource.includes('data-testid="reset-password-confirm-input"') &&
      resetSource.includes('aria-invalid={Boolean(confirmInlineError)}') &&
      resetSource.includes('data-testid="reset-password-confirm-error"') &&
      resetSource.includes('role={resetState ===') &&
      resetSource.includes('data-testid="reset-password-message"') &&
      resetSource.includes('disabled={isLoading || resetState ===') &&
      !resetSource.includes('disabled={!token || !passwordIsValid || !passwordsMatch || isLoading || resetState ==='),
    'Reset password page must expose token/password/confirmation inline validation and keep reset submission reachable for custom errors',
  );

  assert(
    localBackendOriginSource.includes('normalizeLocalBackendBase') &&
      localBackendOriginSource.includes('url.hostname = window.location.hostname') &&
      adminContentApiSource.includes('normalizeLocalBackendBase(envBase ||'),
    'Local admin API resolution must normalize localhost/127.0.0.1 backend origins to the active admin host so cookie-backed sessions survive validation',
  );

  assert(
    authStoreSource.includes("persisted.session.authMode === 'local-demo' ? persisted.session.token : undefined") &&
      authStoreSource.includes("state.session.authMode === 'local-demo' ? state.session.token : undefined"),
    'Local demo admin sessions must persist their token so reloads and route changes do not sign the user out.',
  );

  assert(
    authStoreSource.includes('fetchAdminSession(token)') &&
      adminContentApiSource.includes('normalizeLocalBackendBase(envBase ||'),
    'Auth store must validate sessions through the API client that normalizes local backend origins.',
  );

  assert(
    adminSessionTokenSource.includes('let liveAdminSessionToken') &&
      adminSessionTokenSource.includes('getActiveAdminSessionToken') &&
      authStoreSource.includes('setActiveAdminSessionToken(data.session.token)') &&
      authStoreSource.includes('setActiveAdminSessionToken(persistedSession?.token)') &&
      adminContentApiSource.includes('getActiveAdminSessionToken()') &&
      mediaApiSource.includes('getActiveAdminSessionToken()'),
    'Admin content and media requests must read the live session token immediately after login, before localStorage persistence races can trigger 401 sign-outs.',
  );

  assert(
    adminAuthApiSource.includes('AUTH_REQUEST_TIMEOUT_MS') &&
      adminAuthApiSource.includes('adminAuthFetch') &&
      adminAuthApiSource.includes('AdminAuthNetworkError') &&
      adminAuthApiSource.includes('Backy admin API did not respond'),
    'Admin auth API requests must time out with a clear local-backend message instead of trapping the shell behind an infinite loader.',
  );

  assert(
    authStoreSource.includes('error instanceof AdminAuthNetworkError') &&
      authStoreSource.includes('isUnexpiredSession(current.session)') &&
      authStoreSource.includes('setActiveAdminSessionToken(current.session.token)') &&
      authStoreSource.includes('user: current.user') &&
      authStoreSource.includes('session: current.session'),
    'Admin session refresh must preserve an unexpired local session during transient backend/network failures instead of immediately signing out.',
  );

  assert(
    navigationAccessSource.includes('const currentAuth = useAuthStore.getState();') &&
      navigationAccessSource.includes('if (currentAuth.user && currentAuth.session)') &&
      navigationAccessSource.includes('PERMISSION_SYNC_FALLBACK_MESSAGE') &&
      navigationAccessSource.includes('isRecoverableSessionPermissionError') &&
      navigationAccessSource.includes('clearUserPermissionsCache(currentAdminId);') &&
      navigationAccessSource.includes('const [permissionRefreshIndex, setPermissionRefreshIndex]') &&
      navigationAccessSource.includes('const refreshPermissions = useCallback(() => {') &&
      navigationAccessSource.includes('permissionSyncError') &&
      !navigationAccessSource.includes('signOut();'),
    'Admin navigation permission sync must fall back to role defaults, expose retryable sync state, and avoid signing the user out from a secondary permission-matrix failure.',
  );

  assert(
    rootRouteSource.includes("const [cookieSessionStatus, setCookieSessionStatus] = useState<'idle' | 'checking' | 'failed'>('idle')") &&
      rootRouteSource.includes('COOKIE_SESSION_RESTORE_TIMEOUT_MS') &&
      rootRouteSource.includes("cookieSessionStatus === 'idle'") &&
      rootRouteSource.includes("cookieSessionStatus !== 'checking'") &&
      rootRouteSource.includes('await refreshSession();') &&
      rootRouteSource.includes("setCookieSessionStatus(currentAuth.user && currentAuth.session ? 'idle' : 'failed')") &&
      rootRouteSource.includes("data-auth-gate-reason={authGateReason}") &&
      rootRouteSource.includes("'restoring-cookie-session'") &&
      rootRouteSource.includes("'checking-cookie-session'"),
    'Root auth gate must restore a cookie-backed admin session before redirecting protected routes to login.',
  );

  assert(
    permissionSource.includes('if (!permissionMatrix && currentAdmin) return roleDefaults[key]?.includes(currentAdmin.role) ?? false;'),
    'Admin shell permissions must fall back to role defaults while the backend permission matrix is loading.',
  );

  assert(
    adminContentApiSource.includes('const userPermissionMatrixCache = new Map<string, AdminUserPermissionMatrix>();') &&
      adminContentApiSource.includes('const userPermissionMatrixRequests = new Map<string, Promise<AdminUserPermissionMatrix>>();') &&
      adminContentApiSource.includes('let userPermissionMatrixCacheRevision = 0;') &&
      adminContentApiSource.includes('const getUserPermissionCacheKey = (userId: string): string => {') &&
      adminContentApiSource.includes('export const clearUserPermissionsCache = (userId?: string): void => {') &&
      adminContentApiSource.includes('export const getCachedUserPermissions = (userId: string): AdminUserPermissionMatrix | null =>') &&
      adminContentApiSource.includes('const cached = userPermissionMatrixCache.get(cacheKey);') &&
      adminContentApiSource.includes('if (cached) return Promise.resolve(cached);') &&
      adminContentApiSource.includes('const inFlight = userPermissionMatrixRequests.get(cacheKey);') &&
      adminContentApiSource.includes('if (inFlight) return inFlight;') &&
      adminContentApiSource.includes('const cacheRevision = userPermissionMatrixCacheRevision;') &&
      adminContentApiSource.includes('userPermissionMatrixCache.set(cacheKey, matrix);') &&
      adminContentApiSource.includes('userPermissionMatrixRequests.delete(cacheKey);') &&
      adminContentApiSource.includes('clearUserPermissionsCache(userId);') &&
      authStoreSource.includes('clearUserPermissionsCache();') &&
      navigationAccessSource.includes('currentAdminId ? getCachedUserPermissions(currentAdminId) : null') &&
      navigationAccessSource.includes('const [permissionMatrixUserId, setPermissionMatrixUserId]') &&
      navigationAccessSource.includes('setPermissionMatrixUserId(currentAdminId);') &&
      navigationAccessSource.includes('const scopedPermissionMatrix = currentAdminId && permissionMatrixUserId === currentAdminId') &&
      navigationAccessSource.includes('permissionMatrix: scopedPermissionMatrix') &&
      navigationAccessSource.includes('getUserPermissions(currentAdminId)'),
    'Admin pages, header, and sidebar navigation must share cached permission-matrix loading, clear it on auth changes, and avoid exposing one user permission matrix to another account during shell switches.',
  );

  assert(
    mainLayoutSource.includes("const SIDEBAR_COLLAPSED_STORAGE_KEY = 'backy:admin-sidebar-collapsed'") &&
      mainLayoutSource.includes("const SIDEBAR_DENSE_COLLAPSED_STORAGE_KEY = 'backy:admin-sidebar-dense-collapsed'") &&
      mainLayoutSource.includes('const SIDEBAR_DEFAULT_COLLAPSED_ROUTES = [') &&
      mainLayoutSource.includes('getStoredSidebarCollapsed') &&
      mainLayoutSource.includes('getStoredDenseSidebarCollapsed') &&
      mainLayoutSource.includes('getDefaultSidebarCollapsed(pathname)') &&
      mainLayoutSource.includes('const [hasStoredSidebarPreference, setHasStoredSidebarPreference] = useState(() => getStoredSidebarCollapsed() !== null);') &&
      mainLayoutSource.includes('const [hasStoredDenseSidebarPreference, setHasStoredDenseSidebarPreference] = useState(() => getStoredDenseSidebarCollapsed() !== null);') &&
      mainLayoutSource.includes('const sidebarCollapsed = isDenseAdminSurface ? denseSidebarCollapsed : standardSidebarCollapsed') &&
      mainLayoutSource.includes('if (!hasStoredSidebarPreference && !isDenseAdminSurface)') &&
      mainLayoutSource.includes('if (!hasStoredDenseSidebarPreference && isDenseAdminSurface)') &&
      mainLayoutSource.includes('setHasStoredSidebarPreference(true);') &&
      mainLayoutSource.includes('setHasStoredDenseSidebarPreference(true);') &&
      mainLayoutSource.includes('window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(standardSidebarCollapsed))') &&
      mainLayoutSource.includes('window.localStorage.setItem(SIDEBAR_DENSE_COLLAPSED_STORAGE_KEY, String(denseSidebarCollapsed))') &&
      mainLayoutSource.includes('const effectiveSidebarCollapsed = isEditorWorkspace || sidebarCollapsed') &&
      mainLayoutSource.includes('if (isEditorWorkspace) return;') &&
      mainLayoutSource.includes('className="flex h-dvh min-h-0 min-w-0 overflow-hidden bg-background"') &&
      mainLayoutSource.includes('className="hidden h-dvh shrink-0 lg:flex"') &&
      mainLayoutSource.includes('data-dense-surface={String(isDenseAdminSurface)}') &&
      mainLayoutSource.includes("'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'") &&
      mainLayoutSource.includes('Skip to content') &&
      mainLayoutSource.includes('data-testid="admin-main-content"'),
    'Admin layout must preserve standard sidebar preference, keep dense work surfaces compact by default, keep editor workspaces compact, keep sidebar/main scrolling independent, and expose a keyboard skip target.',
  );

  assert(
    sidebarSource.includes('collapseLocked?: boolean') &&
      sidebarSource.includes('id: string;') &&
      sidebarSource.includes("import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';") &&
      sidebarSource.includes("import { useStore } from '@/stores/mockStore';") &&
      sidebarSource.includes('const selectedSiteId = getSiteSelectionFromSearch(sites)') &&
      sidebarSource.includes('sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0]') &&
      sidebarSource.includes("const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo'") &&
      sidebarSource.includes('const activeSiteName = activeSite?.name || activeSiteId') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-active-site`}') &&
      sidebarSource.includes("navigationId = 'admin-sidebar-navigation'") &&
      sidebarSource.includes("testIdPrefix = 'admin-sidebar'") &&
      sidebarSource.includes("const SIDEBAR_SECTION_STORAGE_KEY = 'backy:admin-sidebar-section-state';") &&
      sidebarSource.includes('const SIDEBAR_SECTION_STORAGE_VERSION = 2;') &&
      sidebarSource.includes("const DEFAULT_OPEN_SECTION_IDS = ['workspace'];") &&
      sidebarSource.includes("type SidebarSectionStateSource = 'default' | 'stored' | 'legacy-migrated';") &&
      sidebarSource.includes('const normalizeSidebarSectionIds = (sectionIds: unknown) =>') &&
      sidebarSource.includes('const createDefaultSidebarSectionState =') &&
      sidebarSource.includes('if (Array.isArray(parsed))') &&
      sidebarSource.includes('legacySectionIds.size > 1') &&
      sidebarSource.includes('writeSidebarSectionState(migratedSectionIds, legacySectionIds.size);') &&
      sidebarSource.includes('const migratedFromLegacyCount = typeof parsed.migratedFromLegacyCount') &&
      sidebarSource.includes("source: migratedFromLegacyCount > 0 ? 'legacy-migrated' : 'stored'") &&
      sidebarSource.includes('version: SIDEBAR_SECTION_STORAGE_VERSION') &&
      sidebarSource.includes('migratedFromLegacyCount') &&
      sidebarSource.includes('readSidebarSectionState') &&
      sidebarSource.includes('writeSidebarSectionState') &&
      sidebarSource.includes('const [sectionStateSource, setSectionStateSource]') &&
      sidebarSource.includes('const [legacySectionStateCount, setLegacySectionStateCount]') &&
      sidebarSource.includes('aria-controls={navigationId}') &&
      sidebarSource.includes('aria-expanded={!collapsed}') &&
      sidebarSource.includes('aria-describedby={sidebarActionStatusId}') &&
      sidebarSource.includes('aria-label={toggleLabel}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-toggle`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-action-status`}') &&
      sidebarSource.includes('const sidebarActionStatusId = `${navigationId}-action-status`;') &&
      sidebarSource.includes("const sidebarNavigationMode = collapsed ? 'compact-rail' : 'expanded-panel';") &&
      sidebarSource.includes('navigation tools across ${visibleSections.length} groups in compact rail') &&
      sidebarSource.includes('Labels show on hover or focus.') &&
      sidebarSource.includes('Filter navigation and group density controls are available when expanded.') &&
      sidebarSource.includes('const sidebarActionStatus = `${permissionSyncStatus} ${sidebarFilterSummary}') &&
      sidebarSource.includes('data-action-status={sidebarActionStatus}') &&
      sidebarSource.includes('data-action-state={collapseLocked ?') &&
      sidebarSource.includes("type SidebarQuickCreatePermission = 'pages.edit';") &&
      sidebarSource.includes('const SIDEBAR_QUICK_CREATE_ACTIONS') &&
      sidebarSource.includes("to: '/pages/new'") &&
      sidebarSource.includes("to: '/blog/new'") &&
      sidebarSource.includes('const quickCreateActions = useMemo(() => (') &&
      sidebarSource.includes('const quickCreateStatusId = `${navigationId}-quick-create-status`;') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-quick-create`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-quick-create-status`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-quick-create-${action.id}`}') &&
      sidebarSource.includes('data-quick-create-count={quickCreateActions.length}') &&
      sidebarSource.includes('search={activeSiteSearch}') &&
      sidebarSource.includes('data-target-site-id={activeSiteId}') &&
      sidebarSource.includes('data-required-permission={action.permissionKey}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-nav`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-density-controls`}') &&
      sidebarSource.includes('const [navFilter, setNavFilter]') &&
      sidebarSource.includes('const deferredNavFilter = useDeferredValue(navFilter);') &&
      sidebarSource.includes('const renderedSections = useMemo(() => {') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-filter-input`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-filter-clear`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-filter-empty`}') &&
      sidebarSource.includes('data-empty-filter={normalizedNavFilter}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-filter-empty-clear`}') &&
      sidebarSource.includes('data-nav-filtered={String(Boolean(normalizedNavFilter))}') &&
      sidebarSource.includes('data-nav-mode={sidebarNavigationMode}') &&
      sidebarSource.includes('data-rendered-nav-item-count={renderedItemCount}') &&
      sidebarSource.includes('data-section-state-version={SIDEBAR_SECTION_STORAGE_VERSION}') &&
      sidebarSource.includes('data-section-state-source={sectionStateSource}') &&
      sidebarSource.includes('data-legacy-section-state-count={legacySectionStateCount}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-collapse-inactive-sections`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-expand-all-sections`}') &&
      sidebarSource.includes('collapseInactiveSections') &&
      sidebarSource.includes('expandAllSections') &&
      sidebarSource.includes('const sectionActionStatus = `${section.label} group') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-section-toggle-${section.id}`}') &&
      sidebarSource.includes('data-section-status={sectionActionStatus}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-link-${item.id}`}') &&
      sidebarSource.includes('interface SidebarRailTooltip') &&
      sidebarSource.includes('const [railTooltip, setRailTooltip]') &&
      sidebarSource.includes("const showRailTooltip = (item: Pick<NavItem, 'label' | 'to' | 'area'>, target: HTMLElement)") &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-rail-tooltip`}') &&
      sidebarSource.includes('data-tooltip-item={railTooltip.label.toLowerCase()}') &&
      sidebarSource.includes('data-nav-area={item.area}') &&
      sidebarSource.includes('data-nav-route={item.to}') &&
      sidebarSource.includes('data-nav-active={String(isActive)}') &&
      sidebarSource.includes('data-nav-section={section.id}') &&
      sidebarSource.includes('data-nav-section-expanded={String(sectionExpanded)}') &&
      sidebarSource.includes('data-expanded-section-count={expandedSectionCount}') &&
      sidebarSource.includes('data-collapsed-section-count={collapsedSectionCount}') &&
      sidebarSource.includes("data-active-nav-section={activeSectionId || ''}") &&
      sidebarSource.includes('data-permissions-loading={String(permissionsLoading)}') &&
      sidebarSource.includes('data-permission-source={permissionSource}') &&
      sidebarSource.includes('const permissionSyncState = !currentUser') &&
      sidebarSource.includes('const permissionSyncStatusId = `${navigationId}-permission-sync-status`;') &&
      sidebarSource.includes('const permissionSyncStatus = !currentUser') &&
      sidebarSource.includes('Syncing detailed admin permissions; role-default navigation is active.') &&
      sidebarSource.includes('Retry permission sync available.') &&
      sidebarSource.includes('data-permission-sync-state={permissionSyncState}') &&
      sidebarSource.includes('data-permission-sync-status={permissionSyncStatus}') &&
      sidebarSource.includes('data-permission-sync-error={permissionSyncError || undefined}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-permission-sync-status`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-permission-sync-recovery`}') &&
      sidebarSource.includes('data-testid={`${testIdPrefix}-permission-sync-retry`}') &&
      sidebarSource.includes('Permission sync failed. Role defaults stay active.') &&
      sidebarSource.includes('onClick={refreshPermissions}') &&
      sidebarSource.includes('data-nav-ready={String(navigationUsable)}') &&
      sidebarSource.includes('data-nav-item-count={visibleItemCount}') &&
      sidebarSource.includes("'flex h-full min-h-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out'") &&
      sidebarSource.includes('className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]"') &&
      sidebarSource.includes('lg:min-h-9 lg:py-1.5') &&
      sidebarSource.includes('[scrollbar-gutter:stable]') &&
      sidebarSource.includes('focus-ring'),
    'Admin sidebar must preserve active site scope while exposing shared action status, stable scroll, active-site context, unclipped compact rail tooltips, active state hooks, accessible collapse controls, role-default navigation readiness, and testable navigation hooks.',
  );

  assert(
    headerSource.includes('aria-label="Open admin navigation"') &&
      headerSource.includes('aria-controls="admin-mobile-sidebar-navigation"') &&
      headerSource.includes("const mobileNavigationStatusId = 'header-mobile-navigation-status';") &&
      headerSource.includes('data-testid="header-mobile-navigation-status"') &&
      headerSource.includes('data-testid="header-mobile-navigation-toggle"') &&
      headerSource.includes('aria-expanded={mobileSidebarOpen}') &&
      headerSource.includes('aria-describedby={mobileNavigationStatusId}') &&
      headerSource.includes('aria-label="Open account menu"') &&
      headerSource.includes('aria-expanded={userMenuOpen}') &&
      headerSource.includes("const accountMenuId = 'header-account-menu';") &&
      headerSource.includes("const accountActionStatusId = 'header-account-action-status';") &&
      headerSource.includes('data-testid="header-account-action-status"') &&
      headerSource.includes('data-testid="header-account-toggle"') &&
      headerSource.includes('aria-controls={accountMenuId}') &&
      headerSource.includes('aria-describedby={accountActionStatusId}') &&
      headerSource.includes('data-testid="header-account-menu"') &&
      headerSource.includes('data-testid="header-account-settings-action"') &&
      headerSource.includes('data-testid="header-account-sign-out-action"') &&
      headerSource.includes("const profileRouteUserId = user?.id || profileUser?.id || '';") &&
      headerSource.includes("navigate({ to: '/users/$userId', params: { userId: profileRouteUserId } });") &&
      headerSource.includes('data-profile-user-id={profileRouteUserId}') &&
      headerSource.includes('data-action-status={accountActionStatus}') &&
      headerSource.includes('role="menu"') &&
      headerSource.includes('role="menuitem"'),
    'Admin header mobile navigation and account menu controls must expose accessible names, menu state, shared action status metadata, and session-sourced profile routing.',
  );

  assert(
    headerSource.includes('const [notificationsLoadedForSiteId, setNotificationsLoadedForSiteId] = useState<string | null>(null);') &&
      headerSource.includes('const notificationsLoadedForActiveSite = notificationsLoadedForSiteId === activeSiteId;') &&
      headerSource.includes('setNotificationsLoadedForSiteId(activeSiteId);') &&
      headerSource.includes('setNotificationsLoadedForSiteId(null);') &&
      headerSource.includes('if (!notificationsOpen && !isNotificationCenterBusy && !notificationsLoadedForActiveSite) void loadNotifications();') &&
      headerSource.includes('const notificationPanelState = notificationsLoading') &&
      headerSource.includes("const notificationActionStatusId = 'header-notification-action-status';") &&
      headerSource.includes('const notificationActionStatus = notificationDisabledReason') &&
      headerSource.includes('data-testid="header-notification-action-status"') &&
      headerSource.includes('data-testid="header-notification-toggle"') &&
      headerSource.includes('data-testid="header-notification-panel"') &&
      headerSource.includes('data-notification-state={notificationPanelState}') &&
      headerSource.includes('data-action-status={notificationActionStatus}') &&
      headerSource.includes('data-testid="header-notification-refresh"') &&
      headerSource.includes('data-testid={`header-notification-shortcut-${shortcut.id}`}') &&
      headerSource.includes('data-testid="header-notification-error-retry"') &&
      headerSource.includes('data-testid="header-notification-empty-refresh"') &&
      headerSource.includes('data-testid={`header-notification-workflow-action-${notification.id}`}') &&
      headerSource.includes('data-testid={`header-notification-comment-review-${comment.id}`}') &&
      headerSource.includes('data-testid={`header-notification-comment-approve-${comment.id}`}') &&
      headerSource.includes('data-testid={`header-notification-comment-spam-${comment.id}`}') &&
      headerSource.includes('const commentActionDisabledReason = isUpdating') &&
      headerSource.includes('const commentActionStatus = commentActionDisabledReason') &&
      headerSource.includes('data-testid="header-notification-summary-action"'),
    'Admin header notifications must lazy-load per site so initial navigation and sidebar rendering are not blocked by notification fan-out, and must expose shared action status plus testable empty/error recovery actions.',
  );

  assert(
    headerSource.includes('const searchInFlightRef = useRef<string | null>(null);') &&
      headerSource.includes('const latestSearchLoadKeyRef = useRef<string>') &&
      headerSource.includes("const searchHydrationStatus = searchLoading") &&
      headerSource.includes('if (searchInFlightRef.current === loadKey || searchLoadedForSiteId === loadKey) return;') &&
      headerSource.includes('if (latestSearchLoadKeyRef.current !== loadKey) return;') &&
      headerSource.includes('if (!searchOpen || searchLoading || searchError || searchLoadedForSiteId === searchLoadKey) return;') &&
      headerSource.includes('data-search-hydration={searchHydrationStatus}') &&
      headerSource.includes("const searchActionStatusId = 'header-global-search-action-status';") &&
      headerSource.includes('const searchActionStatus = searchDisabledReason') &&
      headerSource.includes('data-testid="header-global-search-action-status"') &&
      headerSource.includes('data-action-status={searchActionStatus}') &&
      headerSource.includes('aria-describedby={searchActionStatusId}') &&
      headerSource.includes('data-testid="header-global-search-popover"') &&
      headerSource.includes('const clearGlobalSearch = useCallback(() => {') &&
      headerSource.includes('data-testid="header-global-search-input"') &&
      headerSource.includes('data-testid="header-global-search-clear"') &&
      headerSource.includes('data-testid="header-global-search-empty"') &&
      headerSource.includes('data-empty-query={searchQuery.trim()}') &&
      headerSource.includes('data-testid="header-global-search-empty-clear"') &&
      headerSource.includes('data-search-result-id={result.id}') &&
      headerSource.includes('data-search-result-type={result.type}') &&
      headerSource.includes('data-testid={`header-global-search-result-${result.id}`}'),
    'Admin header global search must hydrate lazily with in-flight dedupe, stale-site protection, shared action status, testable result actions, and empty-result recovery.',
  );

  assert(
    mainLayoutSource.includes('navigationId="admin-mobile-sidebar-navigation"') &&
      mainLayoutSource.includes('testIdPrefix="admin-mobile-sidebar"') &&
      mainLayoutSource.includes('mobileSidebarOpen={mobileSidebarOpen}') &&
      mainLayoutSource.includes('data-testid="admin-mobile-sidebar-dialog"') &&
      mainLayoutSource.includes('data-mobile-navigation-open="true"') &&
      mainLayoutSource.includes('aria-labelledby="admin-mobile-sidebar-title"') &&
      mainLayoutSource.includes('aria-describedby="admin-mobile-sidebar-description"') &&
      mainLayoutSource.includes('data-testid="admin-mobile-sidebar-backdrop"'),
    'Mobile admin navigation must use unique ids, source/header state, dialog semantics, and test hooks while the hidden desktop shell remains mounted.',
  );

  assert(
    loginSmokeSource.includes('assertSidebarViewportScrollContract') &&
      loginSmokeSource.includes('document.documentElement.scrollHeight') &&
      loginSmokeSource.includes("data-nav-ready") &&
      loginSmokeSource.includes('assertSidebarFilterInteraction') &&
      loginSmokeSource.includes('assertSidebarLayoutControlsInteraction') &&
      loginSmokeSource.includes('assertSidebarLegacySectionStateMigration') &&
      loginSmokeSource.includes('assertSidebarQuickCreateInteraction') &&
      loginSmokeSource.includes('BACKY_LOGIN_SIDEBAR_CREATE_SMOKE') &&
      loginSmokeSource.includes('Sidebar quick create route to new page') &&
      loginSmokeSource.includes('Collapsed sidebar rail tooltip') &&
      loginSmokeSource.includes('Sidebar expand layout restore'),
    'Login smoke must render-test the admin shell scroll contract, sidebar quick-create shortcuts, sidebar filtering, collapse/expand, density, and rail tooltip interactions instead of relying only on source checks.',
  );
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = selectUsablePageTarget(pages);
      if (page) return page;
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const isUsablePageTarget = (target) => {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = target.url || '';
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-error://') ||
    url.startsWith('chrome-extension://')
  );
};

const getTargetScore = (target) => {
  const url = target.url || '';
  if (url.startsWith(ADMIN_BASE_URL)) return 0;
  if (url === 'about:blank') return 1;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return 2;
  if (url.startsWith('http://') || url.startsWith('https://')) return 3;
  return 4;
};

const selectUsablePageTarget = (targets) => (
  [...targets]
    .filter(isUsablePageTarget)
    .sort((left, right) => getTargetScore(left) - getTargetScore(right))[0]
);

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const navigate = async (client, url, readyExpression, description) => {
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const waitForState = async (client, readyExpression, description) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const setInputValue = async (client, selector, value) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'input-missing', selector: ${JSON.stringify(selector)} };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(result.ok, `Unable to set ${selector}: ${JSON.stringify(result)}`);
  return result;
};

const clickButton = async (client, label) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === ${JSON.stringify(label)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-missing', label: ${JSON.stringify(label)} };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', label: ${JSON.stringify(label)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${label}: ${JSON.stringify(result)}`);
};

const waitForText = async (client, text) => {
  let lastState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasText: document.body?.innerText?.includes(${JSON.stringify(text)}) || false,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    lastState = state;
    if (state.hasText) return state;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for text ${text}: ${JSON.stringify(lastState)}`);
};

const readLoginActionStatus = async (client) => evaluate(client, `(() => {
  const form = document.querySelector('[data-testid="login-form"]');
  const status = document.querySelector('[data-testid="login-action-status"]');
  const email = document.querySelector('[data-testid="login-email-input"]');
  const password = document.querySelector('[data-testid="login-password-input"]');
  const mfa = document.querySelector('[data-testid="login-mfa-input"]');
  const readControl = (testId) => {
    const control = document.querySelector('[data-testid="' + testId + '"]');
    return {
      found: Boolean(control),
      describedBy: control?.getAttribute('aria-describedby') || '',
      state: control?.getAttribute('data-action-state') || '',
      status: control?.getAttribute('data-action-status') || '',
      disabledReason: control?.getAttribute('data-disabled-reason') || '',
      disabled: control instanceof HTMLButtonElement ? control.disabled : null,
      text: control?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    };
  };
  return {
    path: window.location.pathname,
    formFound: Boolean(form),
    formDescribedBy: form?.getAttribute('aria-describedby') || '',
    formState: form?.getAttribute('data-action-state') || '',
    formStatus: form?.getAttribute('data-action-status') || '',
    statusId: status?.id || '',
    statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    emailValue: email instanceof HTMLInputElement ? email.value : '',
    emailDescribedBy: email?.getAttribute('aria-describedby') || '',
    emailInvalid: email?.getAttribute('aria-invalid') || '',
    passwordValueLength: password instanceof HTMLInputElement ? password.value.length : -1,
    passwordDescribedBy: password?.getAttribute('aria-describedby') || '',
    passwordInvalid: password?.getAttribute('aria-invalid') || '',
    mfaFound: Boolean(mfa),
    mfaValue: mfa instanceof HTMLInputElement ? mfa.value : '',
    mfaDescribedBy: mfa?.getAttribute('aria-describedby') || '',
    mfaInvalid: mfa?.getAttribute('aria-invalid') || '',
    submit: readControl('login-submit'),
    recovery: readControl('login-password-recovery'),
    adminDemo: readControl('login-demo-admin'),
    editorDemo: readControl('login-demo-editor'),
    body: document.body?.innerText?.slice(0, 1200) || '',
  };
})()`);

const assertLoginFormActionStatus = async (client) => {
  const initial = await readLoginActionStatus(client);
  assert(initial.formFound && initial.path === '/login', `Login form status smoke must start on /login: ${JSON.stringify(initial)}`);
  assert(initial.formDescribedBy === initial.statusId, `Login form must reference shared status: ${JSON.stringify(initial)}`);
  assert(initial.formStatus === initial.statusText, `Login form data status must mirror hidden status: ${JSON.stringify(initial)}`);
  assert(
    initial.formState === 'needs-input' &&
      initial.statusText === 'Enter a valid email and password to sign in.' &&
      initial.submit.state === 'needs-input' &&
      initial.submit.disabled === false &&
      initial.submit.describedBy === initial.statusId &&
      initial.adminDemo.state === 'ready' &&
      initial.editorDemo.state === 'ready',
    `Initial login action status drifted: ${JSON.stringify(initial)}`,
  );

  const demoResult = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="login-demo-admin"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'demo-button-missing' };
    }
    if (button.disabled) {
      return { ok: false, reason: 'demo-button-disabled' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(demoResult.ok, `Unable to select demo admin account: ${JSON.stringify(demoResult)}`);

  const ready = await waitForState(
    client,
    `(() => {
      const form = document.querySelector('[data-testid="login-form"]');
      const status = document.querySelector('[data-testid="login-action-status"]');
      const submit = document.querySelector('[data-testid="login-submit"]');
      const email = document.querySelector('[data-testid="login-email-input"]');
      const password = document.querySelector('[data-testid="login-password-input"]');
      return {
        ready: form?.getAttribute('data-action-state') === 'ready' &&
          status?.textContent?.replace(/\\s+/g, ' ').trim() === 'Sign in available.' &&
          submit?.getAttribute('data-action-state') === 'ready' &&
          email instanceof HTMLInputElement &&
          email.value === 'admin@backy.io' &&
          password instanceof HTMLInputElement &&
          password.value.length >= 6,
        formState: form?.getAttribute('data-action-state') || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        submitState: submit?.getAttribute('data-action-state') || '',
        email: email instanceof HTMLInputElement ? email.value : '',
        passwordLength: password instanceof HTMLInputElement ? password.value.length : -1,
      };
    })()`,
    'Login demo account ready status',
  );

  await clickButton(client, 'Sign in');
  const postSubmit = await waitForState(
    client,
    `(() => {
      const status = document.querySelector('[data-testid="login-action-status"]');
      const submit = document.querySelector('[data-testid="login-submit"]');
      const mfa = document.querySelector('[data-testid="login-mfa-input"]');
      return {
        ready: window.location.pathname === '/' ||
          (mfa instanceof HTMLInputElement &&
            status?.textContent?.replace(/\\s+/g, ' ').trim() === 'Enter your workspace MFA code or phrase to finish signing in.' &&
            submit?.getAttribute('data-action-state') === 'needs-input'),
        path: window.location.pathname,
        needsMfa: mfa instanceof HTMLInputElement,
        mfaDescribedBy: mfa?.getAttribute('aria-describedby') || '',
        mfaInvalid: mfa?.getAttribute('aria-invalid') || '',
        statusId: status?.id || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        submitState: submit?.getAttribute('data-action-state') || '',
      };
    })()`,
    'Login form submit or MFA status',
  );

  let mfaReady = null;
  if (postSubmit.needsMfa) {
    assert(postSubmit.mfaDescribedBy.includes(postSubmit.statusId), `MFA input must reference login action status: ${JSON.stringify(postSubmit)}`);
    await setInputValue(client, '#twoFactorCode', ADMIN_MFA_CODE);
    mfaReady = await waitForState(
      client,
      `(() => {
        const status = document.querySelector('[data-testid="login-action-status"]');
        const submit = document.querySelector('[data-testid="login-submit"]');
        const mfa = document.querySelector('[data-testid="login-mfa-input"]');
        return {
          ready: status?.textContent?.replace(/\\s+/g, ' ').trim() === 'Sign in available with MFA code.' &&
            submit?.getAttribute('data-action-state') === 'ready' &&
            mfa instanceof HTMLInputElement &&
            mfa.value === ${JSON.stringify(ADMIN_MFA_CODE)},
          statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          submitState: submit?.getAttribute('data-action-state') || '',
          mfaValue: mfa instanceof HTMLInputElement ? mfa.value : '',
        };
      })()`,
      'Login MFA ready status',
    );
  }

  return {
    initial,
    ready,
    postSubmit,
    mfaReady,
  };
};

const waitForDashboard = async (client) => {
  let lastState = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      return {
        ready: window.location.pathname === '/' && Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
        path: window.location.pathname,
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        hasMfaInput: Boolean(document.querySelector('#twoFactorCode')),
        hasLoadingScreen: document.body?.innerText?.includes('Loading') || false,
        authGateReason: document.querySelector('[data-testid="auth-gate-loading"]')?.getAttribute('data-auth-gate-reason') || '',
        authError: stored?.state?.error || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    lastState = state;
    if (state.ready && state.userEmail === 'admin@backy.io' && state.hasSession) return state;
    await sleep(250);
  }

  throw new Error(`Dashboard did not load after backend-backed login: ${JSON.stringify(lastState)}`);
};

const assertHeaderSearchHydration = async (client) => {
  const initialState = await evaluate(client, `(() => {
    const shell = document.querySelector('[data-search-hydration]');
    const input = document.querySelector('[data-testid="header-global-search-input"]');
    const status = document.querySelector('[data-testid="header-global-search-action-status"]');
    return {
      hasShell: Boolean(shell),
      status: shell?.getAttribute('data-search-hydration') || '',
      actionState: shell?.getAttribute('data-action-state') || '',
      actionStatus: shell?.getAttribute('data-action-status') || '',
      statusId: status?.id || '',
      statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      hasInput: input instanceof HTMLInputElement,
      inputDescribedBy: input?.getAttribute('aria-describedby') || '',
      value: input instanceof HTMLInputElement ? input.value : null,
      body: document.body?.innerText?.slice(0, 500) || '',
    };
  })()`);
  assert(
    initialState.hasShell &&
      initialState.hasInput &&
      initialState.status === 'idle' &&
      initialState.actionState === 'ready' &&
      initialState.actionStatus === initialState.statusText &&
      initialState.inputDescribedBy === initialState.statusId &&
      initialState.statusText.includes('search result') &&
      initialState.statusText.includes('Result actions available.'),
    `Global search should stay idle before user focus: ${JSON.stringify(initialState)}`,
  );

  await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="header-global-search-input"]');
    if (!(input instanceof HTMLInputElement)) return false;
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    input.click();
    input.focus();
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    return true;
  })()`);

  const hydratedState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-search-hydration]');
      const input = document.querySelector('[data-testid="header-global-search-input"]');
      const status = document.querySelector('[data-testid="header-global-search-action-status"]');
      const popover = document.querySelector('[data-testid="header-global-search-popover"]');
      const resultButtons = [...document.querySelectorAll('[data-testid^="header-global-search-result-"]')];
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const readyResults = resultButtons.filter((button) => (
        button instanceof HTMLButtonElement &&
        button.getAttribute('aria-describedby') === status?.id &&
        button.getAttribute('data-action-state') === 'ready' &&
        button.getAttribute('data-action-status') === statusText &&
        Boolean(button.getAttribute('data-search-result-id')) &&
        Boolean(button.getAttribute('data-search-result-type'))
      )).length;
      return {
        ready: shell?.getAttribute('data-search-hydration') === 'ready' &&
          input instanceof HTMLInputElement &&
          document.body?.innerText?.includes('Search Backy') &&
          popover instanceof HTMLElement &&
          popover.getAttribute('aria-describedby') === status?.id &&
          popover.getAttribute('data-action-status') === statusText &&
          resultButtons.length > 0 &&
          readyResults === resultButtons.length,
        status: shell?.getAttribute('data-search-hydration') || '',
        actionState: shell?.getAttribute('data-action-state') || '',
        actionStatus: shell?.getAttribute('data-action-status') || '',
        statusId: status?.id || '',
        statusText,
        popoverState: popover?.getAttribute('data-action-state') || '',
        popoverStatus: popover?.getAttribute('data-action-status') || '',
        hasInput: input instanceof HTMLInputElement,
        hasPopover: document.body?.innerText?.includes('Search Backy') || false,
        results: resultButtons.length,
        readyResults,
        firstResultId: resultButtons[0]?.getAttribute('data-search-result-id') || '',
        firstResultType: resultButtons[0]?.getAttribute('data-search-result-type') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Header global search hydration',
  );
  assert(
    hydratedState.actionState === 'ready' &&
      hydratedState.actionStatus === hydratedState.statusText &&
      hydratedState.popoverState === 'ready' &&
      hydratedState.popoverStatus === hydratedState.statusText &&
      hydratedState.readyResults === hydratedState.results,
    `Header global search result actions should expose shared ready status: ${JSON.stringify(hydratedState)}`,
  );

  await setInputValue(client, '[data-testid="header-global-search-input"]', 'Pages');
  const filteredState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-search-hydration]');
      const status = document.querySelector('[data-testid="header-global-search-action-status"]');
      const resultButtons = [...document.querySelectorAll('[data-testid^="header-global-search-result-"]')];
      const pagesResult = resultButtons.find((button) => button.textContent?.includes('Pages'));
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: shell?.getAttribute('data-search-hydration') === 'ready' &&
          document.body?.innerText?.includes('Pages') &&
          pagesResult instanceof HTMLButtonElement &&
          pagesResult.getAttribute('aria-describedby') === status?.id &&
          pagesResult.getAttribute('data-action-state') === 'ready' &&
          pagesResult.getAttribute('data-action-status') === statusText,
        status: shell?.getAttribute('data-search-hydration') || '',
        statusId: status?.id || '',
        statusText,
        hasPagesResult: document.body?.innerText?.includes('Pages') || false,
        pagesResultState: pagesResult?.getAttribute('data-action-state') || '',
        pagesResultStatus: pagesResult?.getAttribute('data-action-status') || '',
        pagesResultType: pagesResult?.getAttribute('data-search-result-type') || '',
        resultCount: resultButtons.length,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Header global search filtered results',
  );
  assert(
    filteredState.statusText.includes('for "Pages"') &&
      filteredState.pagesResultStatus === filteredState.statusText &&
      filteredState.resultCount > 0,
    `Header global search filtered result should preserve action status: ${JSON.stringify(filteredState)}`,
  );

  await setInputValue(client, '[data-testid="header-global-search-input"]', 'zz-no-result');
  const emptyState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-search-hydration]');
      const input = document.querySelector('[data-testid="header-global-search-input"]');
      const empty = document.querySelector('[data-testid="header-global-search-empty"]');
      const emptyClear = document.querySelector('[data-testid="header-global-search-empty-clear"]');
      const status = document.querySelector('[data-testid="header-global-search-action-status"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: shell?.getAttribute('data-search-hydration') === 'ready' &&
          input instanceof HTMLInputElement &&
          input.value === 'zz-no-result' &&
          empty instanceof HTMLElement &&
          empty.getAttribute('data-empty-query') === 'zz-no-result' &&
          Boolean(empty.textContent?.includes('No results for "zz-no-result"')) &&
          emptyClear instanceof HTMLButtonElement &&
          emptyClear.getAttribute('aria-describedby') === status?.id &&
          emptyClear.getAttribute('data-action-state') === 'ready' &&
          emptyClear.getAttribute('data-action-status') === statusText,
        status: shell?.getAttribute('data-search-hydration') || '',
        statusId: status?.id || '',
        statusText,
        value: input instanceof HTMLInputElement ? input.value : null,
        emptyQuery: empty?.getAttribute('data-empty-query') || '',
        hasEmptyClear: emptyClear instanceof HTMLButtonElement,
        emptyClearState: emptyClear?.getAttribute('data-action-state') || '',
        emptyClearStatus: emptyClear?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Header global search empty state',
  );
  assert(
    emptyState.statusText.includes('0 search results available for "zz-no-result".') &&
      emptyState.emptyClearStatus === emptyState.statusText,
    `Header global search empty clear should reference shared status: ${JSON.stringify(emptyState)}`,
  );

  const clearClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="header-global-search-empty-clear"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'empty-clear-missing' };
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    return { ok: true };
  })()`);
  assert(clearClick.ok, `Header global search empty clear button should be clickable: ${JSON.stringify(clearClick)}`);

  const clearedState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-search-hydration]');
      const input = document.querySelector('[data-testid="header-global-search-input"]');
      const empty = document.querySelector('[data-testid="header-global-search-empty"]');
      const status = document.querySelector('[data-testid="header-global-search-action-status"]');
      const resultButtons = [...document.querySelectorAll('[data-testid^="header-global-search-result-"]')];
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const readyResults = resultButtons.filter((button) => (
        button instanceof HTMLButtonElement &&
        button.getAttribute('aria-describedby') === status?.id &&
        button.getAttribute('data-action-state') === 'ready' &&
        button.getAttribute('data-action-status') === statusText
      )).length;
      return {
        ready: shell?.getAttribute('data-search-hydration') === 'ready' &&
          input instanceof HTMLInputElement &&
          input.value === '' &&
          !(empty instanceof HTMLElement) &&
          resultButtons.length > 0 &&
          readyResults === resultButtons.length,
        status: shell?.getAttribute('data-search-hydration') || '',
        statusId: status?.id || '',
        statusText,
        value: input instanceof HTMLInputElement ? input.value : null,
        hasEmpty: empty instanceof HTMLElement,
        results: resultButtons.length,
        readyResults,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Header global search empty clear recovery',
  );

  return { initialState, hydratedState, filteredState, emptyState, clearedState };
};

const assertHeaderNotificationsInteraction = async (client) => {
  const initialState = await evaluate(client, `(() => {
    const toggle = document.querySelector('[data-testid="header-notification-toggle"]');
    const panel = document.querySelector('[data-testid="header-notification-panel"]');
    const status = document.querySelector('[data-testid="header-notification-action-status"]');
    return {
      hasToggle: toggle instanceof HTMLButtonElement,
      expanded: toggle?.getAttribute('aria-expanded') || '',
      describedBy: toggle?.getAttribute('aria-describedby') || '',
      actionState: toggle?.getAttribute('data-action-state') || '',
      actionStatus: toggle?.getAttribute('data-action-status') || '',
      disabledReason: toggle?.getAttribute('data-disabled-reason') || '',
      statusId: status?.id || '',
      statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      hasPanel: panel instanceof HTMLElement,
      body: document.body?.innerText?.slice(0, 500) || '',
    };
  })()`);
  assert(
    initialState.hasToggle &&
      initialState.expanded === 'false' &&
      !initialState.hasPanel &&
      initialState.describedBy === initialState.statusId &&
      initialState.actionState === 'ready' &&
      initialState.actionStatus === initialState.statusText &&
      initialState.statusText.includes('Refresh available.') &&
      initialState.statusText.includes('Workflow shortcuts available.'),
    `Notification center should start closed with a testable toggle: ${JSON.stringify(initialState)}`,
  );

  const openClick = await evaluate(client, `(() => {
    const toggle = document.querySelector('[data-testid="header-notification-toggle"]');
    if (!(toggle instanceof HTMLButtonElement)) return { ok: false, reason: 'toggle-missing' };
    toggle.click();
    return { ok: true };
  })()`);
  assert(openClick.ok, `Unable to open notification center: ${JSON.stringify(openClick)}`);

  const openedState = await waitForState(
    client,
    `(() => {
      const toggle = document.querySelector('[data-testid="header-notification-toggle"]');
      const panel = document.querySelector('[data-testid="header-notification-panel"]');
      const state = panel?.getAttribute('data-notification-state') || '';
      const status = document.querySelector('[data-testid="header-notification-action-status"]');
      const shortcuts = document.querySelectorAll('[data-testid^="header-notification-shortcut-"]').length;
      const refresh = document.querySelector('[data-testid="header-notification-refresh"]');
      const summary = document.querySelector('[data-testid="header-notification-summary-action"]');
      const shortcut = document.querySelector('[data-testid^="header-notification-shortcut-"]');
      const workflowActions = [...document.querySelectorAll('[data-testid^="header-notification-workflow-action-"]')];
      const commentReviewActions = [...document.querySelectorAll('[data-testid^="header-notification-comment-review-"]')];
      const commentApproveActions = [...document.querySelectorAll('[data-testid^="header-notification-comment-approve-"]')];
      const commentSpamActions = [...document.querySelectorAll('[data-testid^="header-notification-comment-spam-"]')];
      const describedReady = (button) => button instanceof HTMLButtonElement &&
        button.getAttribute('aria-describedby') === status?.id &&
        button.getAttribute('data-action-state') === 'ready' &&
        Boolean(button.getAttribute('data-action-status'));
      return {
        ready: toggle?.getAttribute('aria-expanded') === 'true' &&
          panel instanceof HTMLElement &&
          ['empty', 'ready'].includes(state) &&
          shortcuts >= 3 &&
          refresh instanceof HTMLButtonElement &&
          summary instanceof HTMLButtonElement &&
          panel.getAttribute('aria-describedby') === status?.id &&
          panel.getAttribute('data-action-status') === status?.textContent?.replace(/\\s+/g, ' ').trim() &&
          refresh.getAttribute('aria-describedby') === status?.id &&
          summary.getAttribute('aria-describedby') === status?.id,
        expanded: toggle?.getAttribute('aria-expanded') || '',
        state,
        actionState: panel?.getAttribute('data-action-state') || '',
        statusId: status?.id || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        statusData: panel?.getAttribute('data-action-status') || '',
        count: Number(panel?.getAttribute('data-notification-count') || 0),
        shortcuts,
        hasRefresh: refresh instanceof HTMLButtonElement,
        refreshState: refresh?.getAttribute('data-action-state') || '',
        refreshDescribedBy: refresh?.getAttribute('aria-describedby') || '',
        shortcutState: shortcut?.getAttribute('data-action-state') || '',
        shortcutDescribedBy: shortcut?.getAttribute('aria-describedby') || '',
        shortcutStatus: shortcut?.getAttribute('data-action-status') || '',
        workflowActionCount: workflowActions.length,
        workflowActionsReady: workflowActions.every(describedReady),
        commentReviewActionCount: commentReviewActions.length,
        commentReviewActionsReady: commentReviewActions.every(describedReady),
        commentApproveActionCount: commentApproveActions.length,
        commentApproveActionsReady: commentApproveActions.every((button) => (
          button instanceof HTMLButtonElement &&
          button.getAttribute('aria-describedby') === status?.id &&
          ['ready', 'blocked'].includes(button.getAttribute('data-action-state') || '') &&
          Boolean(button.getAttribute('data-action-status'))
        )),
        commentSpamActionCount: commentSpamActions.length,
        commentSpamActionsReady: commentSpamActions.every((button) => (
          button instanceof HTMLButtonElement &&
          button.getAttribute('aria-describedby') === status?.id &&
          ['ready', 'blocked'].includes(button.getAttribute('data-action-state') || '') &&
          Boolean(button.getAttribute('data-action-status'))
        )),
        hasSummary: summary instanceof HTMLButtonElement,
        summaryState: summary?.getAttribute('data-action-state') || '',
        summaryDescribedBy: summary?.getAttribute('aria-describedby') || '',
        summaryStatus: summary?.getAttribute('data-action-status') || '',
        hasEmpty: Boolean(document.querySelector('[data-testid="header-notification-empty"]')),
        hasError: Boolean(document.querySelector('[data-testid="header-notification-error"]')),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    'Header notification center open',
  );
  assert(
    openedState.actionState === 'ready' &&
      openedState.statusData === openedState.statusText &&
      openedState.statusText.includes('Refresh available.') &&
      openedState.statusText.includes('Workflow shortcuts available.') &&
      openedState.refreshState === 'ready' &&
      openedState.refreshDescribedBy === openedState.statusId &&
      openedState.shortcutState === 'ready' &&
      openedState.shortcutDescribedBy === openedState.statusId &&
      openedState.shortcutStatus === openedState.statusText &&
      openedState.workflowActionsReady &&
      openedState.commentReviewActionsReady &&
      openedState.commentApproveActionsReady &&
      openedState.commentSpamActionsReady &&
      openedState.summaryState === 'ready' &&
      openedState.summaryDescribedBy === openedState.statusId &&
      openedState.summaryStatus === openedState.statusText,
    `Header notification action status should describe ready controls: ${JSON.stringify(openedState)}`,
  );

  if (openedState.state === 'empty') {
    const emptyRecoveryState = await waitForState(
      client,
      `(() => {
        const empty = document.querySelector('[data-testid="header-notification-empty"]');
        const emptyRefresh = document.querySelector('[data-testid="header-notification-empty-refresh"]');
        const emptySettings = document.querySelector('[data-testid="header-notification-empty-settings"]');
        const status = document.querySelector('[data-testid="header-notification-action-status"]');
        return {
          ready: empty instanceof HTMLElement &&
            emptyRefresh instanceof HTMLButtonElement &&
            emptySettings instanceof HTMLButtonElement &&
            Boolean(empty.textContent?.includes('No active notifications')) &&
            emptyRefresh.getAttribute('aria-describedby') === status?.id &&
            emptySettings.getAttribute('aria-describedby') === status?.id,
          hasEmpty: empty instanceof HTMLElement,
          hasEmptyRefresh: emptyRefresh instanceof HTMLButtonElement,
          emptyRefreshState: emptyRefresh?.getAttribute('data-action-state') || '',
          emptyRefreshDescribedBy: emptyRefresh?.getAttribute('aria-describedby') || '',
          emptyRefreshStatus: emptyRefresh?.getAttribute('data-action-status') || '',
          hasEmptySettings: emptySettings instanceof HTMLButtonElement,
          emptySettingsState: emptySettings?.getAttribute('data-action-state') || '',
          emptySettingsDescribedBy: emptySettings?.getAttribute('aria-describedby') || '',
          emptySettingsStatus: emptySettings?.getAttribute('data-action-status') || '',
          statusId: status?.id || '',
          statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          body: empty?.textContent || '',
        };
      })()`,
      'Header notification empty-state recovery controls',
    );
    assert(
      emptyRecoveryState.emptyRefreshState === 'ready' &&
        emptyRecoveryState.emptySettingsState === 'ready' &&
        emptyRecoveryState.emptyRefreshDescribedBy === emptyRecoveryState.statusId &&
        emptyRecoveryState.emptySettingsDescribedBy === emptyRecoveryState.statusId &&
        emptyRecoveryState.emptyRefreshStatus === emptyRecoveryState.statusText &&
        emptyRecoveryState.emptySettingsStatus === emptyRecoveryState.statusText,
      `Header notification empty actions must reference shared status: ${JSON.stringify(emptyRecoveryState)}`,
    );

    const emptyRefreshClick = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="header-notification-empty-refresh"]');
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'empty-refresh-missing' };
      button.click();
      return { ok: true };
    })()`);
    assert(emptyRefreshClick.ok, `Notification empty refresh should be clickable: ${JSON.stringify(emptyRefreshClick)}`);

    const emptyRefreshedState = await waitForState(
      client,
      `(() => {
        const panel = document.querySelector('[data-testid="header-notification-panel"]');
        const state = panel?.getAttribute('data-notification-state') || '';
        return {
          ready: panel instanceof HTMLElement && ['empty', 'ready'].includes(state),
          state,
          count: Number(panel?.getAttribute('data-notification-count') || 0),
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      })()`,
      'Header notification empty refresh recovery',
    );

    return { initialState, openedState, emptyRecoveryState, emptyRefreshedState };
  }

  const refreshClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="header-notification-refresh"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'refresh-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(refreshClick.ok, `Notification refresh should be clickable: ${JSON.stringify(refreshClick)}`);

  const refreshedState = await waitForState(
    client,
    `(() => {
      const panel = document.querySelector('[data-testid="header-notification-panel"]');
      const state = panel?.getAttribute('data-notification-state') || '';
      const shortcuts = document.querySelectorAll('[data-testid^="header-notification-shortcut-"]').length;
      const summary = document.querySelector('[data-testid="header-notification-summary-action"]');
      const status = document.querySelector('[data-testid="header-notification-action-status"]');
      return {
        ready: panel instanceof HTMLElement &&
          ['empty', 'ready'].includes(state) &&
          shortcuts >= 3 &&
          summary instanceof HTMLButtonElement &&
          panel.getAttribute('data-action-status') === status?.textContent?.replace(/\\s+/g, ' ').trim() &&
          summary.getAttribute('aria-describedby') === status?.id,
        state,
        actionState: panel?.getAttribute('data-action-state') || '',
        statusId: status?.id || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        statusData: panel?.getAttribute('data-action-status') || '',
        count: Number(panel?.getAttribute('data-notification-count') || 0),
        shortcuts,
        hasSummary: summary instanceof HTMLButtonElement,
        summaryState: summary?.getAttribute('data-action-state') || '',
        summaryDescribedBy: summary?.getAttribute('aria-describedby') || '',
        summaryStatus: summary?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    'Header notification refresh recovery',
  );
  assert(
    refreshedState.actionState === 'ready' &&
      refreshedState.statusData === refreshedState.statusText &&
      refreshedState.summaryState === 'ready' &&
      refreshedState.summaryDescribedBy === refreshedState.statusId &&
      refreshedState.summaryStatus === refreshedState.statusText,
    `Header notification refreshed state should preserve shared action status: ${JSON.stringify(refreshedState)}`,
  );

  return { initialState, openedState, refreshedState };
};

const assertHeaderAccountMenuInteraction = async (client) => {
  await evaluate(client, `(() => {
    const notificationPanel = document.querySelector('[data-testid="header-notification-panel"]');
    const notificationToggle = document.querySelector('[data-testid="header-notification-toggle"]');
    if (notificationPanel instanceof HTMLElement && notificationToggle instanceof HTMLButtonElement) {
      notificationToggle.click();
    }
    return { ok: true };
  })()`);
  await waitForState(
    client,
    `(() => ({
      ready: !document.querySelector('[data-testid="header-notification-panel"]'),
      hasPanel: Boolean(document.querySelector('[data-testid="header-notification-panel"]')),
    }))()`,
    'Header notification center closed before account menu smoke',
  );

  const initialState = await evaluate(client, `(() => {
    const toggle = document.querySelector('[data-testid="header-account-toggle"]');
    const status = document.querySelector('[data-testid="header-account-action-status"]');
    const menu = document.querySelector('[data-testid="header-account-menu"]');
    return {
      hasToggle: toggle instanceof HTMLButtonElement,
      expanded: toggle?.getAttribute('aria-expanded') || '',
      controls: toggle?.getAttribute('aria-controls') || '',
      describedBy: toggle?.getAttribute('aria-describedby') || '',
      actionState: toggle?.getAttribute('data-action-state') || '',
      actionStatus: toggle?.getAttribute('data-action-status') || '',
      statusId: status?.id || '',
      statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      hasMenu: menu instanceof HTMLElement,
      body: document.body?.innerText?.slice(0, 700) || '',
    };
  })()`);
  assert(
    initialState.hasToggle &&
      initialState.expanded === 'false' &&
      initialState.controls === 'header-account-menu' &&
      initialState.describedBy === initialState.statusId &&
      initialState.actionState === 'ready' &&
      initialState.actionStatus === initialState.statusText &&
      initialState.statusText.includes('Profile available.') &&
      initialState.statusText.includes('Settings available.') &&
      initialState.statusText.includes('Sign out available') &&
      !initialState.hasMenu,
    `Header account menu should start closed with shared action status: ${JSON.stringify(initialState)}`,
  );

  const openClick = await evaluate(client, `(() => {
    const toggle = document.querySelector('[data-testid="header-account-toggle"]');
    if (!(toggle instanceof HTMLButtonElement)) return { ok: false, reason: 'account-toggle-missing' };
    toggle.click();
    return { ok: true };
  })()`);
  assert(openClick.ok, `Unable to open account menu: ${JSON.stringify(openClick)}`);

  const openedState = await waitForState(
    client,
    `(() => {
      const toggle = document.querySelector('[data-testid="header-account-toggle"]');
      const status = document.querySelector('[data-testid="header-account-action-status"]');
      const menu = document.querySelector('[data-testid="header-account-menu"]');
      const profile = document.querySelector('[data-testid="header-profile-link"]');
      const settings = document.querySelector('[data-testid="header-account-settings-action"]');
      const signOut = document.querySelector('[data-testid="header-account-sign-out-action"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const readyAction = (button) => button instanceof HTMLButtonElement &&
        button.getAttribute('aria-describedby') === status?.id &&
        button.getAttribute('data-action-state') === 'ready' &&
        button.getAttribute('data-action-status') === statusText;
      return {
        ready: toggle?.getAttribute('aria-expanded') === 'true' &&
          menu instanceof HTMLElement &&
          menu.id === toggle?.getAttribute('aria-controls') &&
          menu.getAttribute('role') === 'menu' &&
          menu.getAttribute('aria-describedby') === status?.id &&
          menu.getAttribute('data-action-status') === statusText &&
          readyAction(profile) &&
          readyAction(settings) &&
          readyAction(signOut),
        expanded: toggle?.getAttribute('aria-expanded') || '',
        statusId: status?.id || '',
        statusText,
        menuId: menu?.id || '',
        menuDescribedBy: menu?.getAttribute('aria-describedby') || '',
        menuStatus: menu?.getAttribute('data-action-status') || '',
        profileState: profile?.getAttribute('data-action-state') || '',
        profileStatus: profile?.getAttribute('data-action-status') || '',
        profileUserId: profile?.getAttribute('data-profile-user-id') || '',
        settingsState: settings?.getAttribute('data-action-state') || '',
        settingsStatus: settings?.getAttribute('data-action-status') || '',
        signOutState: signOut?.getAttribute('data-action-state') || '',
        signOutStatus: signOut?.getAttribute('data-action-status') || '',
        itemCount: document.querySelectorAll('[data-testid="header-account-menu"] [role="menuitem"]').length,
        body: menu?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      };
    })()`,
    'Header account menu open',
  );
  assert(
    openedState.itemCount === 3 &&
      openedState.profileState === 'ready' &&
      openedState.profileStatus === openedState.statusText &&
      openedState.profileUserId === 'user-admin' &&
      openedState.settingsState === 'ready' &&
      openedState.settingsStatus === openedState.statusText &&
      openedState.signOutState === 'ready' &&
      openedState.signOutStatus === openedState.statusText,
    `Header account menu actions should expose shared ready status and route profile by the signed-in admin id: ${JSON.stringify(openedState)}`,
  );

  const closeClick = await evaluate(client, `(() => {
    const toggle = document.querySelector('[data-testid="header-account-toggle"]');
    if (!(toggle instanceof HTMLButtonElement)) return { ok: false, reason: 'account-toggle-missing' };
    toggle.click();
    return { ok: true };
  })()`);
  assert(closeClick.ok, `Unable to close account menu: ${JSON.stringify(closeClick)}`);

  const closedState = await waitForState(
    client,
    `(() => {
      const toggle = document.querySelector('[data-testid="header-account-toggle"]');
      const menu = document.querySelector('[data-testid="header-account-menu"]');
      return {
        ready: toggle?.getAttribute('aria-expanded') === 'false' && !(menu instanceof HTMLElement),
        expanded: toggle?.getAttribute('aria-expanded') || '',
        hasMenu: menu instanceof HTMLElement,
      };
    })()`,
    'Header account menu closed',
  );

  return { initialState, openedState, closedState };
};

const assertMobileNavigationInteraction = async (client) => {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await evaluate(client, `(() => {
    window.dispatchEvent(new Event('resize'));
    const searchInput = document.querySelector('[data-testid="header-global-search-input"]');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      searchInput.blur();
    }
    return { width: window.innerWidth, height: window.innerHeight };
  })()`);

  try {
    const initialState = await waitForState(
      client,
      `(() => {
        const toggle = document.querySelector('[data-testid="header-mobile-navigation-toggle"]');
        const status = document.querySelector('[data-testid="header-mobile-navigation-status"]');
        const dialog = document.querySelector('[data-testid="admin-mobile-sidebar-dialog"]');
        const toggleStyle = toggle instanceof HTMLElement ? getComputedStyle(toggle) : null;
        const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
        return {
          ready: window.innerWidth <= 430 &&
            toggle instanceof HTMLButtonElement &&
            toggleStyle?.display !== 'none' &&
            toggle.getAttribute('aria-controls') === 'admin-mobile-sidebar-navigation' &&
            toggle.getAttribute('aria-expanded') === 'false' &&
            toggle.getAttribute('aria-describedby') === status?.id &&
            toggle.getAttribute('data-action-state') === 'ready' &&
            toggle.getAttribute('data-action-status') === statusText &&
            !(dialog instanceof HTMLElement),
          width: window.innerWidth,
          height: window.innerHeight,
          hasToggle: toggle instanceof HTMLButtonElement,
          toggleDisplay: toggleStyle?.display || '',
          expanded: toggle?.getAttribute('aria-expanded') || '',
          controls: toggle?.getAttribute('aria-controls') || '',
          describedBy: toggle?.getAttribute('aria-describedby') || '',
          actionState: toggle?.getAttribute('data-action-state') || '',
          actionStatus: toggle?.getAttribute('data-action-status') || '',
          statusId: status?.id || '',
          statusText,
          hasDialog: dialog instanceof HTMLElement,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      })()`,
      'Mobile admin navigation toggle ready',
    );
    assert(
      initialState.statusText.includes('Admin navigation is closed.') &&
        initialState.statusText.includes('Open admin navigation available.'),
      `Mobile navigation closed status should explain the toggle action: ${JSON.stringify(initialState)}`,
    );

    const openClick = await evaluate(client, `(() => {
      const toggle = document.querySelector('[data-testid="header-mobile-navigation-toggle"]');
      if (!(toggle instanceof HTMLButtonElement)) return { ok: false, reason: 'mobile-toggle-missing' };
      toggle.click();
      return { ok: true };
    })()`);
    assert(openClick.ok, `Unable to open mobile navigation: ${JSON.stringify(openClick)}`);

    const openedState = await waitForState(
      client,
      `(() => {
        const toggle = document.querySelector('[data-testid="header-mobile-navigation-toggle"]');
        const status = document.querySelector('[data-testid="header-mobile-navigation-status"]');
        const dialog = document.querySelector('[data-testid="admin-mobile-sidebar-dialog"]');
        const dialogStyle = dialog instanceof HTMLElement ? getComputedStyle(dialog) : null;
        const title = document.querySelector('#admin-mobile-sidebar-title');
        const description = document.querySelector('#admin-mobile-sidebar-description');
        const sidebar = document.querySelector('[data-testid="admin-mobile-sidebar"]');
        const nav = document.querySelector('[data-testid="admin-mobile-sidebar-nav"]');
        const activeSite = document.querySelector('[data-testid="admin-mobile-sidebar-active-site"]');
        const backdrop = document.querySelector('[data-testid="admin-mobile-sidebar-backdrop"]');
        const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
        return {
          ready: toggle instanceof HTMLButtonElement &&
            toggle.getAttribute('aria-expanded') === 'true' &&
            toggle.getAttribute('data-action-status') === statusText &&
            dialog instanceof HTMLElement &&
            dialogStyle?.display !== 'none' &&
            dialog.getAttribute('role') === 'dialog' &&
            dialog.getAttribute('aria-modal') === 'true' &&
            dialog.getAttribute('aria-labelledby') === 'admin-mobile-sidebar-title' &&
            dialog.getAttribute('aria-describedby') === 'admin-mobile-sidebar-description' &&
            dialog.getAttribute('data-mobile-navigation-open') === 'true' &&
            title instanceof HTMLElement &&
            description instanceof HTMLElement &&
            sidebar instanceof HTMLElement &&
            sidebar.getAttribute('data-nav-ready') === 'true' &&
            nav instanceof HTMLElement &&
            activeSite instanceof HTMLElement &&
            backdrop instanceof HTMLButtonElement,
          width: window.innerWidth,
          expanded: toggle?.getAttribute('aria-expanded') || '',
          statusText,
          actionStatus: toggle?.getAttribute('data-action-status') || '',
          hasDialog: dialog instanceof HTMLElement,
          dialogDisplay: dialogStyle?.display || '',
          role: dialog?.getAttribute('role') || '',
          modal: dialog?.getAttribute('aria-modal') || '',
          labelledBy: dialog?.getAttribute('aria-labelledby') || '',
          describedBy: dialog?.getAttribute('aria-describedby') || '',
          navReady: sidebar?.getAttribute('data-nav-ready') || '',
          activeSiteText: activeSite?.textContent?.replace(/\\s+/g, '') || '',
          hasBackdrop: backdrop instanceof HTMLButtonElement,
          body: dialog?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 700) || '',
        };
      })()`,
      'Mobile admin navigation dialog open',
    );
    assert(
      openedState.statusText.includes('Admin navigation is open.') &&
        openedState.actionStatus === openedState.statusText &&
        openedState.navReady === 'true',
      `Mobile navigation open status and nav readiness should be testable: ${JSON.stringify(openedState)}`,
    );

    const closeClick = await evaluate(client, `(() => {
      const backdrop = document.querySelector('[data-testid="admin-mobile-sidebar-backdrop"]');
      if (!(backdrop instanceof HTMLButtonElement)) return { ok: false, reason: 'mobile-backdrop-missing' };
      backdrop.click();
      return { ok: true };
    })()`);
    assert(closeClick.ok, `Unable to close mobile navigation: ${JSON.stringify(closeClick)}`);

    const closedState = await waitForState(
      client,
      `(() => {
        const toggle = document.querySelector('[data-testid="header-mobile-navigation-toggle"]');
        const status = document.querySelector('[data-testid="header-mobile-navigation-status"]');
        const dialog = document.querySelector('[data-testid="admin-mobile-sidebar-dialog"]');
        const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
        return {
          ready: toggle instanceof HTMLButtonElement &&
            toggle.getAttribute('aria-expanded') === 'false' &&
            toggle.getAttribute('data-action-status') === statusText &&
            !(dialog instanceof HTMLElement),
          expanded: toggle?.getAttribute('aria-expanded') || '',
          statusText,
          actionStatus: toggle?.getAttribute('data-action-status') || '',
          hasDialog: dialog instanceof HTMLElement,
        };
      })()`,
      'Mobile admin navigation dialog closed',
    );

    return { initialState, openedState, closedState };
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
    await evaluate(client, `(() => {
      window.dispatchEvent(new Event('resize'));
      return { width: window.innerWidth, height: window.innerHeight };
    })()`).catch(() => undefined);
  }
};

const assertSidebarViewportScrollContract = async (client, label = 'admin shell sidebar viewport contract') => {
  const state = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-testid="admin-sidebar-shell"]');
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const nav = document.querySelector('[data-testid="admin-sidebar-nav"]');
      const main = document.querySelector('[data-testid="admin-main-content"]');
      const header = document.querySelector('[data-testid="admin-header-shell"]');
      const toggle = document.querySelector('[data-testid="admin-sidebar-toggle"]');
      const filter = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const permissionSyncStatus = document.querySelector('[data-testid="admin-sidebar-permission-sync-status"]');
      const permissionSyncRecovery = document.querySelector('[data-testid="admin-sidebar-permission-sync-recovery"]');
      const permissionSyncRetry = document.querySelector('[data-testid="admin-sidebar-permission-sync-retry"]');
      const density = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      const collapseInactive = document.querySelector('[data-testid="admin-sidebar-collapse-inactive-sections"]');
      const expandAll = document.querySelector('[data-testid="admin-sidebar-expand-all-sections"]');
      const sectionToggle = document.querySelector('[data-testid^="admin-sidebar-section-toggle-"]');
      const dashboardLink = document.querySelector('[data-testid="admin-sidebar-link-dashboard"]');
      const quickCreate = document.querySelector('[data-testid="admin-sidebar-quick-create"]');
      const quickCreateStatus = document.querySelector('[data-testid="admin-sidebar-quick-create-status"]');
      const quickCreatePage = document.querySelector('[data-testid="admin-sidebar-quick-create-new-page"]');
      const quickCreatePost = document.querySelector('[data-testid="admin-sidebar-quick-create-new-post"]');
      const activeSite = document.querySelector('[data-testid="admin-sidebar-active-site"]');
      const shellRect = shell?.getBoundingClientRect();
      const sidebarRect = sidebar?.getBoundingClientRect();
      const navRect = nav?.getBoundingClientRect();
      const mainRect = main?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      const navOverflowY = nav ? getComputedStyle(nav).overflowY : '';
      const mainOverflowY = main ? getComputedStyle(main).overflowY : '';
      const navReady = sidebar?.getAttribute('data-nav-ready') || '';
      const permissionSource = sidebar?.getAttribute('data-permission-source') || '';
      const permissionSyncState = sidebar?.getAttribute('data-permission-sync-state') || '';
      const permissionSyncStatusAttr = sidebar?.getAttribute('data-permission-sync-status') || '';
      const permissionSyncError = sidebar?.getAttribute('data-permission-sync-error') || '';
      const ariaBusy = sidebar?.getAttribute('aria-busy') || '';
      const renderedItems = Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0);
      const quickCreateCount = Number(sidebar?.getAttribute('data-quick-create-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const permissionSyncStatusText = permissionSyncStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const quickCreateStatusText = quickCreateStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const quickCreateSiteId = quickCreate?.getAttribute('data-target-site-id') || '';
      const permissionSyncStateReady = [
        'synced',
        'syncing-role-defaults',
        'role-defaults',
        'role-defaults-error',
      ].includes(permissionSyncState);
      const permissionRecoveryReady = permissionSyncState !== 'role-defaults-error' || (
        permissionSyncRecovery instanceof HTMLElement &&
        permissionSyncRetry instanceof HTMLButtonElement &&
        permissionSyncRetry.getAttribute('aria-describedby') === permissionSyncStatus?.id &&
        permissionSyncRetry.getAttribute('data-action-state') === 'ready' &&
        permissionSyncRetry.getAttribute('data-action-status') === permissionSyncStatusText
      );
      return {
        ready: Boolean(shell) &&
          Boolean(sidebar) &&
          Boolean(nav) &&
          Boolean(main) &&
          Boolean(header) &&
          navReady === 'true' &&
          renderedItems >= 8 &&
          status instanceof HTMLElement &&
          permissionSyncStatus instanceof HTMLElement &&
          permissionSyncStatusAttr === permissionSyncStatusText &&
          permissionSyncStateReady &&
          permissionRecoveryReady &&
          filter instanceof HTMLInputElement &&
          filter.getAttribute('aria-describedby') === status.id &&
          density instanceof HTMLElement &&
          density.getAttribute('aria-describedby') === status.id &&
          density.getAttribute('data-action-status') === statusText &&
          toggle instanceof HTMLButtonElement &&
          toggle.getAttribute('aria-describedby') === status.id &&
          toggle.getAttribute('data-action-status') === statusText &&
          collapseInactive instanceof HTMLButtonElement &&
          collapseInactive.getAttribute('data-action-status') === statusText &&
          expandAll instanceof HTMLButtonElement &&
          expandAll.getAttribute('data-action-status') === statusText &&
          sectionToggle instanceof HTMLButtonElement &&
          Boolean(sectionToggle.getAttribute('data-section-status')) &&
          dashboardLink instanceof HTMLAnchorElement &&
          dashboardLink.getAttribute('data-action-state') === 'ready' &&
          quickCreate instanceof HTMLElement &&
          quickCreateStatus instanceof HTMLElement &&
          quickCreate.getAttribute('aria-describedby') === quickCreateStatus.id &&
          quickCreate.getAttribute('data-action-status') === quickCreateStatusText &&
          quickCreate.getAttribute('data-quick-create-count') === '2' &&
          quickCreatePage instanceof HTMLAnchorElement &&
          quickCreatePage.href.includes('/pages/new') &&
          quickCreatePage.href.includes('siteId=') &&
          quickCreatePage.getAttribute('aria-describedby') === quickCreateStatus.id &&
          quickCreatePage.getAttribute('data-action-state') === 'ready' &&
          quickCreatePage.getAttribute('data-nav-route') === '/pages/new' &&
          quickCreatePage.getAttribute('data-target-site-id') === quickCreateSiteId &&
          quickCreatePage.getAttribute('data-required-permission') === 'pages.edit' &&
          quickCreatePost instanceof HTMLAnchorElement &&
          quickCreatePost.href.includes('/blog/new') &&
          quickCreatePost.href.includes('siteId=') &&
          quickCreatePost.getAttribute('aria-describedby') === quickCreateStatus.id &&
          quickCreatePost.getAttribute('data-action-state') === 'ready' &&
          quickCreatePost.getAttribute('data-nav-route') === '/blog/new' &&
          quickCreatePost.getAttribute('data-target-site-id') === quickCreateSiteId &&
          quickCreatePost.getAttribute('data-required-permission') === 'pages.edit',
        viewportHeight: window.innerHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body?.scrollHeight || 0,
        shellExists: Boolean(shell),
        sidebarExists: Boolean(sidebar),
        navExists: Boolean(nav),
        mainExists: Boolean(main),
        headerExists: Boolean(header),
        shellHeight: Math.round(shellRect?.height || 0),
        sidebarHeight: Math.round(sidebarRect?.height || 0),
        navHeight: Math.round(navRect?.height || 0),
        navScrollHeight: nav?.scrollHeight || 0,
        navClientHeight: nav?.clientHeight || 0,
        navOverflowY,
        mainHeight: Math.round(mainRect?.height || 0),
        mainScrollHeight: main?.scrollHeight || 0,
        mainClientHeight: main?.clientHeight || 0,
        mainOverflowY,
        headerHeight: Math.round(headerRect?.height || 0),
        mainTop: Math.round(mainRect?.top || 0),
        navReady,
        permissionSource,
        permissionSyncState,
        permissionSyncStatusAttr,
        permissionSyncStatusText,
        permissionSyncError,
        permissionsLoading: sidebar?.getAttribute('data-permissions-loading') || '',
        ariaBusy,
        statusId: status?.id || '',
        statusText,
        permissionSyncStatusId: permissionSyncStatus?.id || '',
        hasPermissionSyncRecovery: permissionSyncRecovery instanceof HTMLElement,
        permissionSyncRetryState: permissionSyncRetry?.getAttribute('data-action-state') || '',
        permissionSyncRetryStatus: permissionSyncRetry?.getAttribute('data-action-status') || '',
        permissionSyncRetryDescribedBy: permissionSyncRetry?.getAttribute('aria-describedby') || '',
        quickCreateCount,
        quickCreateStatusId: quickCreateStatus?.id || '',
        quickCreateStatusText,
        quickCreateDescribedBy: quickCreate?.getAttribute('aria-describedby') || '',
        quickCreateSiteId,
        quickCreatePageHref: quickCreatePage instanceof HTMLAnchorElement ? quickCreatePage.href : '',
        quickCreatePageState: quickCreatePage?.getAttribute('data-action-state') || '',
        quickCreatePageStatus: quickCreatePage?.getAttribute('data-action-status') || '',
        quickCreatePageSiteId: quickCreatePage?.getAttribute('data-target-site-id') || '',
        quickCreatePagePermission: quickCreatePage?.getAttribute('data-required-permission') || '',
        quickCreatePostHref: quickCreatePost instanceof HTMLAnchorElement ? quickCreatePost.href : '',
        quickCreatePostState: quickCreatePost?.getAttribute('data-action-state') || '',
        quickCreatePostStatus: quickCreatePost?.getAttribute('data-action-status') || '',
        quickCreatePostSiteId: quickCreatePost?.getAttribute('data-target-site-id') || '',
        quickCreatePostPermission: quickCreatePost?.getAttribute('data-required-permission') || '',
        sidebarDescribedBy: sidebar?.getAttribute('aria-describedby') || '',
        densityDescribedBy: density?.getAttribute('aria-describedby') || '',
        densityStatus: density?.getAttribute('data-action-status') || '',
        renderedItems,
        sectionCount: Number(sidebar?.getAttribute('data-rendered-nav-section-count') || 0),
        activeSection: sidebar?.getAttribute('data-active-nav-section') || '',
        toggleDisabled: toggle instanceof HTMLButtonElement ? toggle.disabled : null,
        toggleDescribedBy: toggle?.getAttribute('aria-describedby') || '',
        toggleActionState: toggle?.getAttribute('data-action-state') || '',
        toggleActionStatus: toggle?.getAttribute('data-action-status') || '',
        collapseInactiveState: collapseInactive?.getAttribute('data-action-state') || '',
        collapseInactiveStatus: collapseInactive?.getAttribute('data-action-status') || '',
        expandAllState: expandAll?.getAttribute('data-action-state') || '',
        expandAllStatus: expandAll?.getAttribute('data-action-status') || '',
        sectionToggleStatus: sectionToggle?.getAttribute('data-section-status') || '',
        dashboardLinkState: dashboardLink?.getAttribute('data-action-state') || '',
        dashboardLinkStatus: dashboardLink?.getAttribute('data-action-status') || '',
        filterExists: filter instanceof HTMLInputElement,
        filterDescribedBy: filter?.getAttribute('aria-describedby') || '',
        filterActionState: filter?.getAttribute('data-action-state') || '',
        filterActionStatus: filter?.getAttribute('data-action-status') || '',
        activeSiteText: activeSite?.textContent || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    label,
  );

  assert(
    state.shellExists && state.sidebarExists && state.navExists && state.mainExists && state.headerExists,
    `Admin shell pieces should render together: ${JSON.stringify(state)}`,
  );
  assert(
    Math.abs(state.shellHeight - state.viewportHeight) <= 4 &&
      Math.abs(state.sidebarHeight - state.viewportHeight) <= 4,
    `Desktop sidebar should be viewport-bound instead of page-content-height-bound: ${JSON.stringify(state)}`,
  );
  assert(
    state.documentScrollHeight <= state.viewportHeight + 8 &&
      state.bodyScrollHeight <= state.viewportHeight + 8,
    `Document/body should not own admin scrolling; main and nav containers should: ${JSON.stringify(state)}`,
  );
  assert(
    ['auto', 'scroll'].includes(state.navOverflowY) &&
      state.navClientHeight > 160 &&
      state.navClientHeight <= state.sidebarHeight,
    `Sidebar nav must be a local scroll container: ${JSON.stringify(state)}`,
  );
  assert(
    ['auto', 'scroll'].includes(state.mainOverflowY) &&
      state.mainClientHeight <= state.viewportHeight &&
      state.mainClientHeight + state.headerHeight <= state.viewportHeight + 8,
    `Admin main content must scroll separately beneath the header: ${JSON.stringify(state)}`,
  );
  assert(
    state.navReady === 'true' &&
      ['role-defaults', 'matrix'].includes(state.permissionSource) &&
      ['synced', 'syncing-role-defaults', 'role-defaults', 'role-defaults-error'].includes(state.permissionSyncState) &&
      state.permissionSyncStatusAttr === state.permissionSyncStatusText &&
      state.permissionSyncStatusText.length > 0 &&
      (state.permissionSyncState !== 'role-defaults-error' ||
        (state.hasPermissionSyncRecovery &&
          state.permissionSyncRetryState === 'ready' &&
          state.permissionSyncRetryStatus === state.permissionSyncStatusText &&
          state.permissionSyncRetryDescribedBy === state.permissionSyncStatusId)) &&
      state.ariaBusy !== 'true' &&
      state.renderedItems >= 8 &&
      state.filterExists &&
      state.sidebarDescribedBy === state.statusId &&
      state.filterDescribedBy === state.statusId &&
      state.filterActionState === 'ready' &&
      state.filterActionStatus === state.statusText &&
      state.toggleDescribedBy === state.statusId &&
      state.toggleActionState === 'ready' &&
      state.toggleActionStatus === state.statusText &&
      state.collapseInactiveState === 'ready' &&
      state.collapseInactiveStatus === state.statusText &&
      state.expandAllState === 'ready' &&
      state.expandAllStatus === state.statusText &&
      state.sectionToggleStatus.includes('group') &&
      state.dashboardLinkState === 'ready' &&
      state.dashboardLinkStatus.includes('Dashboard navigation available.') &&
      state.quickCreateCount === 2 &&
      state.quickCreateDescribedBy === state.quickCreateStatusId &&
      state.quickCreateStatusText.includes('2 create shortcuts available for') &&
      state.quickCreatePageState === 'ready' &&
      state.quickCreatePageHref.includes('/pages/new') &&
      state.quickCreatePageHref.includes('siteId=') &&
      state.quickCreatePageSiteId === state.quickCreateSiteId &&
      state.quickCreatePagePermission === 'pages.edit' &&
      state.quickCreatePageStatus.includes('New page available for') &&
      state.quickCreatePostState === 'ready' &&
      state.quickCreatePostHref.includes('/blog/new') &&
      state.quickCreatePostHref.includes('siteId=') &&
      state.quickCreatePostSiteId === state.quickCreateSiteId &&
      state.quickCreatePostPermission === 'pages.edit' &&
      state.quickCreatePostStatus.includes('New post available for') &&
      state.toggleDisabled === false &&
      state.activeSiteText.trim().length > 0,
    `Sidebar should be usable while permission data hydrates and expose shared action status plus active-site context: ${JSON.stringify(state)}`,
  );

  return state;
};

const assertSidebarLegacySectionStateMigration = async (client) => {
  const seedState = await evaluate(client, `(() => {
    localStorage.setItem('backy:admin-sidebar-collapsed', 'false');
    localStorage.setItem('backy:admin-sidebar-section-state', JSON.stringify(['workspace', 'content', 'commerce', 'audience', 'platform']));
    return {
      ok: true,
      stored: localStorage.getItem('backy:admin-sidebar-section-state') || '',
    };
  })()`);
  assert(seedState.ok, `Unable to seed legacy sidebar section state: ${JSON.stringify(seedState)}`);

  await client.send('Page.reload', { ignoreCache: true });
  await waitForDashboard(client);

  const migratedState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const workspace = document.querySelector('[data-nav-section="workspace"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const stored = JSON.parse(localStorage.getItem('backy:admin-sidebar-section-state') || '{}');
      const expandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      const collapsedCount = Number(sidebar?.getAttribute('data-collapsed-section-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sidebar?.getAttribute('data-section-state-source') === 'legacy-migrated' &&
          sidebar?.getAttribute('data-section-state-version') === '2' &&
          sidebar?.getAttribute('data-legacy-section-state-count') === '5' &&
          expandedCount === 1 &&
          collapsedCount >= 1 &&
          workspace?.getAttribute('data-nav-section-expanded') === 'true' &&
          content?.getAttribute('data-nav-section-expanded') === 'false' &&
          stored?.version === 2 &&
          stored?.migratedFromLegacyCount === 5 &&
          Array.isArray(stored?.sectionIds) &&
          stored.sectionIds.length === 1 &&
          stored.sectionIds[0] === 'workspace' &&
          statusText.includes('1 groups expanded.'),
        sectionStateSource: sidebar?.getAttribute('data-section-state-source') || '',
        sectionStateVersion: sidebar?.getAttribute('data-section-state-version') || '',
        legacySectionStateCount: sidebar?.getAttribute('data-legacy-section-state-count') || '',
        expandedCount,
        collapsedCount,
        workspaceExpanded: workspace?.getAttribute('data-nav-section-expanded') || '',
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        stored,
        statusText,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar legacy section-state migration',
  );
  assert(
    migratedState.ready,
    `Legacy sidebar section state should migrate away from all-open navigation: ${JSON.stringify(migratedState)}`,
  );

  return migratedState;
};

const assertSidebarFilterInteraction = async (client) => {
  const inputState = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'filter-input-missing' };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'settings');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(inputState.ok, `Unable to use sidebar filter: ${JSON.stringify(inputState)}`);

  const filteredState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const settingsLink = document.querySelector('[data-testid="admin-sidebar-link-settings"]');
      const clear = document.querySelector('[data-testid="admin-sidebar-filter-clear"]');
      const renderedItems = Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0);
      const totalItems = Number(sidebar?.getAttribute('data-nav-item-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sidebar?.getAttribute('data-nav-filtered') === 'true' &&
          input instanceof HTMLInputElement &&
          input.value === 'settings' &&
          settingsLink instanceof HTMLAnchorElement &&
          settingsLink.getAttribute('aria-describedby') === status?.id &&
          settingsLink.getAttribute('data-action-state') === 'ready' &&
          clear instanceof HTMLButtonElement &&
          clear.getAttribute('aria-describedby') === status?.id &&
          clear.getAttribute('data-action-state') === 'ready' &&
          clear.getAttribute('data-action-status') === statusText &&
          renderedItems > 0 &&
          renderedItems < totalItems,
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        statusId: status?.id || '',
        statusText,
        renderedItems,
        totalItems,
        inputValue: input instanceof HTMLInputElement ? input.value : '',
        hasSettingsLink: Boolean(settingsLink),
        settingsLinkState: settingsLink?.getAttribute('data-action-state') || '',
        settingsLinkDescribedBy: settingsLink?.getAttribute('aria-describedby') || '',
        hasClear: Boolean(clear),
        clearState: clear?.getAttribute('data-action-state') || '',
        clearStatus: clear?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar navigation filter interaction',
  );
  assert(
    filteredState.statusText.includes('navigation tools shown for "settings"') &&
      filteredState.clearStatus === filteredState.statusText &&
      filteredState.settingsLinkDescribedBy === filteredState.statusId,
    `Sidebar filtered controls should preserve shared status: ${JSON.stringify(filteredState)}`,
  );

  const clearState = await evaluate(client, `(() => {
    const clear = document.querySelector('[data-testid="admin-sidebar-filter-clear"]');
    if (!(clear instanceof HTMLButtonElement)) return { ok: false, reason: 'clear-missing' };
    clear.click();
    return { ok: true };
  })()`);
  assert(clearState.ok, `Unable to clear sidebar filter: ${JSON.stringify(clearState)}`);

  const clearedByInputButtonState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const renderedItems = Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0);
      const totalItems = Number(sidebar?.getAttribute('data-nav-item-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sidebar?.getAttribute('data-nav-filtered') === 'false' &&
          input instanceof HTMLInputElement &&
          input.value === '' &&
          renderedItems === totalItems &&
          input.getAttribute('data-action-status') === statusText,
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        statusText,
        renderedItems,
        totalItems,
        inputValue: input instanceof HTMLInputElement ? input.value : '',
        inputStatus: input?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar navigation filter clear',
  );

  const noMatchInputState = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'filter-input-missing' };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'zz-no-nav');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(noMatchInputState.ok, `Unable to enter no-match sidebar filter: ${JSON.stringify(noMatchInputState)}`);

  const emptyState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const empty = document.querySelector('[data-testid="admin-sidebar-filter-empty"]');
      const emptyClear = document.querySelector('[data-testid="admin-sidebar-filter-empty-clear"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const renderedItems = Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sidebar?.getAttribute('data-nav-filtered') === 'true' &&
          input instanceof HTMLInputElement &&
          input.value === 'zz-no-nav' &&
          renderedItems === 0 &&
          empty?.getAttribute('data-empty-filter') === 'zz-no-nav' &&
          empty?.textContent?.includes('No navigation matches "zz-no-nav"') &&
          emptyClear instanceof HTMLButtonElement &&
          emptyClear.textContent?.trim() === 'Clear filter' &&
          emptyClear.getAttribute('aria-describedby') === status?.id &&
          emptyClear.getAttribute('data-action-state') === 'ready' &&
          emptyClear.getAttribute('data-action-status') === statusText,
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        statusId: status?.id || '',
        statusText,
        renderedItems,
        inputValue: input instanceof HTMLInputElement ? input.value : '',
        emptyFilter: empty?.getAttribute('data-empty-filter') || '',
        emptyText: empty?.textContent || '',
        hasEmptyClear: emptyClear instanceof HTMLButtonElement,
        emptyClearState: emptyClear?.getAttribute('data-action-state') || '',
        emptyClearStatus: emptyClear?.getAttribute('data-action-status') || '',
        emptyClearDescribedBy: emptyClear?.getAttribute('aria-describedby') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar navigation filter empty state',
  );
  assert(
    emptyState.statusText.includes('0 of') &&
      emptyState.statusText.includes('navigation tools shown for "zz-no-nav"') &&
      emptyState.emptyClearStatus === emptyState.statusText &&
      emptyState.emptyClearDescribedBy === emptyState.statusId,
    `Sidebar empty filter action should reference shared status: ${JSON.stringify(emptyState)}`,
  );

  const emptyClearState = await evaluate(client, `(() => {
    const clear = document.querySelector('[data-testid="admin-sidebar-filter-empty-clear"]');
    if (!(clear instanceof HTMLButtonElement)) return { ok: false, reason: 'empty-clear-missing' };
    clear.click();
    return { ok: true };
  })()`);
  assert(emptyClearState.ok, `Unable to clear sidebar empty filter: ${JSON.stringify(emptyClearState)}`);

  const clearedState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const renderedItems = Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0);
      const totalItems = Number(sidebar?.getAttribute('data-nav-item-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sidebar?.getAttribute('data-nav-filtered') === 'false' &&
          input instanceof HTMLInputElement &&
          input.value === '' &&
          renderedItems === totalItems &&
          !document.querySelector('[data-testid="admin-sidebar-filter-empty"]') &&
          input.getAttribute('data-action-status') === statusText,
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        statusText,
        renderedItems,
        totalItems,
        inputValue: input instanceof HTMLInputElement ? input.value : '',
        hasEmpty: Boolean(document.querySelector('[data-testid="admin-sidebar-filter-empty"]')),
        inputStatus: input?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar navigation empty-filter clear',
  );

  return { filteredState, clearedByInputButtonState, emptyState, clearedState };
};

const assertSidebarLayoutControlsInteraction = async (client) => {
  const expandAllClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-expand-all-sections"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'expand-all-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(expandAllClick.ok, `Unable to click sidebar expand-all control: ${JSON.stringify(expandAllClick)}`);

  const expandedAllState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const sectionCount = Number(sidebar?.getAttribute('data-rendered-nav-section-count') || 0);
      const expandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      const collapsedCount = Number(sidebar?.getAttribute('data-collapsed-section-count') || 0);
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: sectionCount >= 5 &&
          expandedCount === sectionCount &&
          collapsedCount === 0 &&
          statusText.includes(String(expandedCount) + ' groups expanded.'),
        sectionCount,
        expandedCount,
        collapsedCount,
        statusText,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`,
    'Sidebar expand-all sections',
  );

  const collapseInactiveClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-collapse-inactive-sections"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'collapse-inactive-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(collapseInactiveClick.ok, `Unable to click sidebar active-group control: ${JSON.stringify(collapseInactiveClick)}`);

  const activeOnlyState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const activeSection = sidebar?.getAttribute('data-active-nav-section') || '';
      const expandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      const collapsedCount = Number(sidebar?.getAttribute('data-collapsed-section-count') || 0);
      const workspace = document.querySelector('[data-nav-section="workspace"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: activeSection === 'workspace' &&
          expandedCount === 1 &&
          collapsedCount >= 1 &&
          workspace?.getAttribute('data-nav-section-expanded') === 'true' &&
          content?.getAttribute('data-nav-section-expanded') === 'false' &&
          statusText.includes('1 groups expanded.'),
        activeSection,
        expandedCount,
        collapsedCount,
        workspaceExpanded: workspace?.getAttribute('data-nav-section-expanded') || '',
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        statusText,
      };
    })()`,
    'Sidebar active-section density control',
  );

  const contentToggleClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'content-section-toggle-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(contentToggleClick.ok, `Unable to toggle sidebar content section: ${JSON.stringify(contentToggleClick)}`);

  const sectionToggleState = await waitForState(
    client,
    `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const contentToggle = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const expandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      return {
        ready: contentToggle instanceof HTMLButtonElement &&
          contentToggle.getAttribute('aria-expanded') === 'true' &&
          contentToggle.getAttribute('data-section-status')?.includes('Content group expanded') &&
          content?.getAttribute('data-nav-section-expanded') === 'true' &&
          expandedCount >= 2,
        expandedCount,
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        contentToggleExpanded: contentToggle?.getAttribute('aria-expanded') || '',
        contentToggleStatus: contentToggle?.getAttribute('data-section-status') || '',
      };
    })()`,
    'Sidebar section toggle expands content group',
  );

  const collapseClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'sidebar-toggle-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(collapseClick.ok, `Unable to collapse sidebar: ${JSON.stringify(collapseClick)}`);

  const collapsedState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-testid="admin-sidebar-shell"]');
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const density = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      const toggle = document.querySelector('[data-testid="admin-sidebar-toggle"]');
      const pagesLink = document.querySelector('[data-testid="admin-sidebar-link-pages"]');
      const quickCreate = document.querySelector('[data-testid="admin-sidebar-quick-create"]');
      const quickCreatePage = document.querySelector('[data-testid="admin-sidebar-quick-create-new-page"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: shell?.getAttribute('data-collapsed') === 'true' &&
          sidebar?.getAttribute('data-collapsed') === 'true' &&
          sidebar?.getAttribute('data-nav-mode') === 'compact-rail' &&
          !(density instanceof HTMLElement) &&
          quickCreate instanceof HTMLElement &&
          quickCreate.getAttribute('data-collapsed') === 'true' &&
          quickCreatePage instanceof HTMLAnchorElement &&
          quickCreatePage.getAttribute('aria-label') === 'New page' &&
          quickCreatePage.textContent?.trim() === '' &&
          toggle instanceof HTMLButtonElement &&
          toggle.getAttribute('aria-expanded') === 'false' &&
          toggle.getAttribute('data-action-status') === statusText &&
          statusText.includes('navigation tools across') &&
          statusText.includes('in compact rail') &&
          statusText.includes('Labels show on hover or focus.') &&
          statusText.includes('Filter navigation and group density controls are available when expanded.') &&
          statusText.includes('Expand sidebar available.') &&
          !statusText.includes('groups expanded') &&
          pagesLink instanceof HTMLAnchorElement,
        shellCollapsed: shell?.getAttribute('data-collapsed') || '',
        sidebarCollapsed: sidebar?.getAttribute('data-collapsed') || '',
        navMode: sidebar?.getAttribute('data-nav-mode') || '',
        hasDensity: density instanceof HTMLElement,
        hasQuickCreate: quickCreate instanceof HTMLElement,
        quickCreateCollapsed: quickCreate?.getAttribute('data-collapsed') || '',
        quickCreatePageLabel: quickCreatePage?.getAttribute('aria-label') || '',
        quickCreatePageText: quickCreatePage?.textContent?.trim() || '',
        toggleExpanded: toggle?.getAttribute('aria-expanded') || '',
        statusText,
        hasPagesLink: pagesLink instanceof HTMLAnchorElement,
      };
    })()`,
    'Sidebar collapse layout',
  );

  const railTooltipTrigger = await evaluate(client, `(() => {
    const link = document.querySelector('[data-testid="admin-sidebar-link-pages"]');
    if (!(link instanceof HTMLAnchorElement)) return { ok: false, reason: 'pages-link-missing' };
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    link.focus();
    return { ok: true };
  })()`);
  assert(railTooltipTrigger.ok, `Unable to trigger collapsed sidebar tooltip: ${JSON.stringify(railTooltipTrigger)}`);

  const railTooltipState = await waitForState(
    client,
    `(() => {
      const tooltip = document.querySelector('[data-testid="admin-sidebar-rail-tooltip"]');
      return {
        ready: tooltip instanceof HTMLElement &&
          tooltip.getAttribute('data-tooltip-item') === 'pages' &&
          tooltip.getAttribute('data-tooltip-route') === '/pages' &&
          tooltip.getAttribute('data-tooltip-area') === 'pages',
        hasTooltip: tooltip instanceof HTMLElement,
        item: tooltip?.getAttribute('data-tooltip-item') || '',
        route: tooltip?.getAttribute('data-tooltip-route') || '',
        area: tooltip?.getAttribute('data-tooltip-area') || '',
        text: tooltip?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      };
    })()`,
    'Collapsed sidebar rail tooltip',
  );

  const expandClick = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'sidebar-toggle-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(expandClick.ok, `Unable to expand sidebar: ${JSON.stringify(expandClick)}`);

  const expandedState = await waitForState(
    client,
    `(() => {
      const shell = document.querySelector('[data-testid="admin-sidebar-shell"]');
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const status = document.querySelector('[data-testid="admin-sidebar-action-status"]');
      const density = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      const toggle = document.querySelector('[data-testid="admin-sidebar-toggle"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: shell?.getAttribute('data-collapsed') === 'false' &&
          sidebar?.getAttribute('data-collapsed') === 'false' &&
          sidebar?.getAttribute('data-nav-mode') === 'expanded-panel' &&
          density instanceof HTMLElement &&
          toggle instanceof HTMLButtonElement &&
          toggle.getAttribute('aria-expanded') === 'true' &&
          toggle.getAttribute('data-action-status') === statusText &&
          statusText.includes('Collapse sidebar available.'),
        shellCollapsed: shell?.getAttribute('data-collapsed') || '',
        sidebarCollapsed: sidebar?.getAttribute('data-collapsed') || '',
        navMode: sidebar?.getAttribute('data-nav-mode') || '',
        hasDensity: density instanceof HTMLElement,
        toggleExpanded: toggle?.getAttribute('aria-expanded') || '',
        statusText,
      };
    })()`,
    'Sidebar expand layout restore',
  );

  return { expandedAllState, activeOnlyState, sectionToggleState, collapsedState, railTooltipState, expandedState };
};

const assertSidebarQuickCreateInteraction = async (client) => {
  const initialState = await waitForState(
    client,
    `(() => {
      const quickCreate = document.querySelector('[data-testid="admin-sidebar-quick-create"]');
      const status = document.querySelector('[data-testid="admin-sidebar-quick-create-status"]');
      const page = document.querySelector('[data-testid="admin-sidebar-quick-create-new-page"]');
      const post = document.querySelector('[data-testid="admin-sidebar-quick-create-new-post"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const siteId = quickCreate?.getAttribute('data-target-site-id') || '';
      return {
        ready: quickCreate instanceof HTMLElement &&
          status instanceof HTMLElement &&
          quickCreate.getAttribute('aria-describedby') === status.id &&
          statusText.includes('2 create shortcuts available for') &&
          page instanceof HTMLAnchorElement &&
          page.href.includes('/pages/new') &&
          page.href.includes('siteId=') &&
          page.getAttribute('data-action-state') === 'ready' &&
          page.getAttribute('data-target-site-id') === siteId &&
          page.getAttribute('data-required-permission') === 'pages.edit' &&
          post instanceof HTMLAnchorElement &&
          post.href.includes('/blog/new') &&
          post.href.includes('siteId=') &&
          post.getAttribute('data-action-state') === 'ready' &&
          post.getAttribute('data-target-site-id') === siteId &&
          post.getAttribute('data-required-permission') === 'pages.edit',
        statusText,
        siteId,
        pageHref: page instanceof HTMLAnchorElement ? page.href : '',
        pageState: page?.getAttribute('data-action-state') || '',
        pageStatus: page?.getAttribute('data-action-status') || '',
        postHref: post instanceof HTMLAnchorElement ? post.href : '',
        postState: post?.getAttribute('data-action-state') || '',
        postStatus: post?.getAttribute('data-action-status') || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    'Sidebar quick create ready',
  );

  const pageClick = await evaluate(client, `(() => {
    const page = document.querySelector('[data-testid="admin-sidebar-quick-create-new-page"]');
    if (!(page instanceof HTMLAnchorElement)) return { ok: false, reason: 'new-page-missing' };
    page.click();
    return { ok: true, href: page.href };
  })()`);
  assert(pageClick.ok, `Unable to click sidebar quick-create page shortcut: ${JSON.stringify(pageClick)}`);

  const pageRouteState = await waitForState(
    client,
    `(() => {
      const body = document.body?.innerText || '';
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      const commandStatus = document.querySelector('[data-testid="page-create-command-action-status"]');
      const commandStatusText = commandStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const back = document.querySelector('[data-testid="page-create-back-to-pages"]');
      const copy = document.querySelector('[data-testid="page-create-copy-handoff"]');
      const download = document.querySelector('[data-testid="page-create-download-handoff"]');
      const pageCommandActionsReady = commandStatus instanceof HTMLElement &&
        back instanceof HTMLButtonElement &&
        copy instanceof HTMLButtonElement &&
        download instanceof HTMLButtonElement &&
        back.getAttribute('aria-describedby') === commandStatus.id &&
        copy.getAttribute('aria-describedby') === commandStatus.id &&
        download.getAttribute('aria-describedby') === commandStatus.id &&
        back.getAttribute('data-action-state') === 'ready' &&
        copy.getAttribute('data-action-state') === 'ready' &&
        download.getAttribute('data-action-state') === 'ready' &&
        (back.getAttribute('data-action-status') || '').includes('Back to Pages available for site-demo') &&
        (copy.getAttribute('data-action-status') || '').includes('Copy page creation handoff available for site-demo') &&
        (download.getAttribute('data-action-status') || '').includes('Download page creation handoff available for site-demo') &&
        commandStatusText.includes(copy.getAttribute('data-action-status') || '') &&
        commandStatusText.includes(download.getAttribute('data-action-status') || '');
      return {
        ready: window.location.pathname === '/pages/new' &&
          window.location.search.includes('siteId=site-demo') &&
          Boolean(document.querySelector('[data-testid="page-create-primary-submit"]')) &&
          Boolean(document.querySelector('[data-testid="page-create-title-input"]')) &&
          pageCommandActionsReady &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt) &&
          !body.includes('Authenticated admin access'),
        path: window.location.pathname,
        search: window.location.search,
        hasSubmit: Boolean(document.querySelector('[data-testid="page-create-primary-submit"]')),
        hasTitle: Boolean(document.querySelector('[data-testid="page-create-title-input"]')),
        commandStatusId: commandStatus?.id || '',
        commandStatusText,
        backState: back?.getAttribute('data-action-state') || '',
        copyState: copy?.getAttribute('data-action-state') || '',
        downloadState: download?.getAttribute('data-action-state') || '',
        backStatus: back?.getAttribute('data-action-status') || '',
        copyStatus: copy?.getAttribute('data-action-status') || '',
        downloadStatus: download?.getAttribute('data-action-status') || '',
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        body: body.slice(0, 900),
      };
    })()`,
    'Sidebar quick create route to new page',
  );

  const postClick = await evaluate(client, `(() => {
    const post = document.querySelector('[data-testid="admin-sidebar-quick-create-new-post"]');
    if (!(post instanceof HTMLAnchorElement)) return { ok: false, reason: 'new-post-missing' };
    post.click();
    return { ok: true, href: post.href };
  })()`);
  assert(postClick.ok, `Unable to click sidebar quick-create post shortcut: ${JSON.stringify(postClick)}`);

  const postRouteState = await waitForState(
    client,
    `(() => {
      const body = document.body?.innerText || '';
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      const commandStatus = document.querySelector('[data-testid="blog-create-command-action-status"]');
      const commandStatusText = commandStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const back = document.querySelector('[data-testid="blog-create-back-to-blog"]');
      const focus = document.querySelector('[data-testid="blog-create-focus-toggle"]');
      const copy = document.querySelector('[data-testid="blog-create-copy-handoff"]');
      const download = document.querySelector('[data-testid="blog-create-download-handoff"]');
      const blogCommandActionsReady = commandStatus instanceof HTMLElement &&
        back instanceof HTMLButtonElement &&
        focus instanceof HTMLButtonElement &&
        copy instanceof HTMLButtonElement &&
        download instanceof HTMLButtonElement &&
        back.getAttribute('aria-describedby') === commandStatus.id &&
        focus.getAttribute('aria-describedby') === commandStatus.id &&
        copy.getAttribute('aria-describedby') === commandStatus.id &&
        download.getAttribute('aria-describedby') === commandStatus.id &&
        back.getAttribute('data-action-state') === 'ready' &&
        focus.getAttribute('data-action-state') === 'ready' &&
        copy.getAttribute('data-action-state') === 'ready' &&
        download.getAttribute('data-action-state') === 'ready' &&
        (back.getAttribute('data-action-status') || '').includes('Back to Blog posts available for site-demo') &&
        (focus.getAttribute('data-action-status') || '').includes('Focus blog creation canvas available.') &&
        (copy.getAttribute('data-action-status') || '').includes('Copy blog creation handoff available for site-demo') &&
        (download.getAttribute('data-action-status') || '').includes('Download blog creation handoff available for site-demo') &&
        commandStatusText.includes(copy.getAttribute('data-action-status') || '') &&
        commandStatusText.includes(download.getAttribute('data-action-status') || '');
      return {
        ready: window.location.pathname === '/blog/new' &&
          window.location.search.includes('siteId=site-demo') &&
          Boolean(document.querySelector('[data-testid="blog-create-command-center"]')) &&
          Boolean(document.querySelector('[data-testid="blog-create-title-input"]')) &&
          blogCommandActionsReady &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt) &&
          !body.includes('Authenticated admin access'),
        path: window.location.pathname,
        search: window.location.search,
        hasCommandCenter: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
        hasTitle: Boolean(document.querySelector('[data-testid="blog-create-title-input"]')),
        commandStatusId: commandStatus?.id || '',
        commandStatusText,
        backState: back?.getAttribute('data-action-state') || '',
        focusState: focus?.getAttribute('data-action-state') || '',
        copyState: copy?.getAttribute('data-action-state') || '',
        downloadState: download?.getAttribute('data-action-state') || '',
        backStatus: back?.getAttribute('data-action-status') || '',
        focusStatus: focus?.getAttribute('data-action-status') || '',
        copyStatus: copy?.getAttribute('data-action-status') || '',
        downloadStatus: download?.getAttribute('data-action-status') || '',
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        body: body.slice(0, 900),
      };
    })()`,
    'Sidebar quick create route to new post',
  );

  return { initialState, pageRouteState, postRouteState };
};

const assertSessionSurvivesIdleReloadAndNavigation = async (client) => {
  await sleep(2500);
  await waitForState(
    client,
    `(() => {
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      const body = document.body?.innerText || '';
      return {
        ready: window.location.pathname === '/' &&
          Boolean(document.querySelector('[data-testid="dashboard-command-center"]')) &&
          Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')) &&
          Boolean(document.querySelector('[data-testid="admin-header-shell"]')) &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt) &&
          !body.includes('Authenticated admin access'),
        path: window.location.pathname,
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        hasSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
        hasHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
        body: body.slice(0, 900),
      };
    })()`,
    'Authenticated dashboard idle session',
  );

  await client.send('Page.reload', { ignoreCache: true });
  await waitForDashboard(client);
  const reloadedShell = await assertSidebarViewportScrollContract(client, 'Dashboard shell after reload');

  await evaluate(client, `(() => {
    localStorage.setItem('backy:admin-sidebar-collapsed', 'false');
    localStorage.removeItem('backy:admin-sidebar-dense-collapsed');
    return { ok: true };
  })()`);

  await navigate(
    client,
    `${ADMIN_BASE_URL}/blog?siteId=site-demo`,
    `(() => {
      const body = document.body?.innerText || '';
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      const sidebarShell = document.querySelector('[data-testid="admin-sidebar-shell"]');
      return {
        ready: window.location.pathname === '/blog' &&
          Boolean(sidebarShell) &&
          sidebarShell?.getAttribute('data-collapsed') === 'true' &&
          sidebarShell?.getAttribute('data-dense-surface') === 'true' &&
          Boolean(document.querySelector('[data-testid="admin-header-shell"]')) &&
          body.includes('Blog Posts') &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt) &&
          !body.includes('Authenticated admin access'),
        path: window.location.pathname,
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        hasSidebar: Boolean(sidebarShell),
        sidebarCollapsed: sidebarShell?.getAttribute('data-collapsed') || '',
        denseSurface: sidebarShell?.getAttribute('data-dense-surface') || '',
        hasHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
        body: body.slice(0, 900),
      };
    })()`,
    'Authenticated blog navigation after dashboard reload',
  );

  await sleep(1500);
  const stableBlogSession = await waitForState(
    client,
    `(() => {
      const body = document.body?.innerText || '';
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      return {
        ready: window.location.pathname === '/blog' &&
          body.includes('Blog Posts') &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt) &&
          !body.includes('Authenticated admin access'),
        path: window.location.pathname,
        userEmail: stored?.state?.user?.email || '',
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        body: body.slice(0, 900),
      };
    })()`,
    'Authenticated blog session stability',
  );

  return { reloadedShell, stableBlogSession };
};

const seedStaleAdminProfile = async (client) => {
  await evaluate(client, `(() => {
    localStorage.setItem('backy-auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'admin-user',
          email: 'admin@backy.io',
          fullName: 'Admin User',
          role: 'admin',
        },
        session: {
          issuedAt: new Date(Date.now() - 60000).toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          authMode: 'local-demo',
        },
      },
      version: 0,
    }));
    return { ok: true };
  })()`);
};

const installPrivateShellLeakObserver = async (client) => {
  const source = `(() => {
    window.__backyPrivateShellLeaked = false;
    const markIfPrivateShellRendered = () => {
      if (
        document.querySelector('[data-testid="admin-header-shell"]') ||
        document.querySelector('[data-testid="admin-sidebar-shell"]') ||
        document.querySelector('[data-testid="settings-page"]')
      ) {
        window.__backyPrivateShellLeaked = true;
      }
    };
    markIfPrivateShellRendered();
    new MutationObserver(markIfPrivateShellRendered).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  })();`;
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source });
  await evaluate(client, source);
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-login-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) childProcess.kill('SIGKILL');
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;

  try {
    assertAuthRecoverySource();
    if (SOURCE_ONLY_MODE) {
      console.log(JSON.stringify({ ok: true, mode: 'login-source-only', route: '/login' }, null, 2));
      return;
    }

    await assertEditorCanReadOwnPermissionMatrix();
    await assertHttpOnlySessionCookieFlow();
    await assertAuthAuditEvents();

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');

    await navigate(
      client,
      `${ADMIN_BASE_URL}/login`,
      `(() => ({
        ready: document.body?.innerText?.includes('Authenticated admin access') &&
          document.body?.innerText?.includes('Demo access'),
        body: document.body?.innerText?.slice(0, 900) || '',
      }))()`,
      'Login page',
    );
    const loginFormUx = await evaluate(client, `(() => {
      const email = document.querySelector('#email');
      const password = document.querySelector('#password');
      return {
        emailAutocomplete: email instanceof HTMLInputElement ? email.autocomplete : '',
        emailAutocapitalize: email instanceof HTMLInputElement ? email.autocapitalize : '',
        emailSpellcheck: email instanceof HTMLInputElement ? email.spellcheck : null,
        passwordAutocomplete: password instanceof HTMLInputElement ? password.autocomplete : '',
      };
    })()`);
    assert(
      loginFormUx.emailAutocomplete === 'username' &&
        loginFormUx.emailAutocapitalize === 'none' &&
        loginFormUx.emailSpellcheck === false &&
        loginFormUx.passwordAutocomplete === 'current-password',
      `Login fields should expose browser credential manager hints: ${JSON.stringify(loginFormUx)}`,
    );
    if (LOGIN_FORM_STATUS_SMOKE) {
      const loginActionStatus = await assertLoginFormActionStatus(client);
      console.log(JSON.stringify({
        ok: true,
        mode: 'login-form-action-status',
        route: '/login',
        loginActionStatus,
      }, null, 2));
      return;
    }

    await installPrivateShellLeakObserver(client);
    await seedStaleAdminProfile(client);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/settings`,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: window.location.pathname === '/login' &&
            body.includes('Authenticated admin access') &&
            body.includes('Demo access') &&
            !body.includes('Backy CMS\\nLoading'),
          path: window.location.pathname,
          stored: JSON.parse(localStorage.getItem('backy-auth-storage') || '{}'),
          privateShellLeaked: window.__backyPrivateShellLeaked === true,
          body: body.slice(0, 900),
        };
      })()`,
      'Login page after stale stored admin profile',
    );
    const staleSessionState = await evaluate(client, `(() => ({
      privateShellLeaked: window.__backyPrivateShellLeaked === true,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    assert(
      !staleSessionState.privateShellLeaked,
      `Stale stored admin session rendered private shell before validation: ${JSON.stringify(staleSessionState)}`,
    );
    await evaluate(client, `(() => {
      localStorage.removeItem('backy-auth-storage');
      return { ok: true };
    })()`);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/login`,
      `(() => ({
        ready: document.body?.innerText?.includes('Authenticated admin access') &&
          document.body?.innerText?.includes('Demo access'),
        body: document.body?.innerText?.slice(0, 900) || '',
      }))()`,
      'Login page after stale profile reset',
    );

    await setInputValue(client, '#email', 'admin@backy.io');
    await setInputValue(client, '#password', 'wrong-password');
    await clickButton(client, 'Sign in');
    await waitForText(client, 'Invalid email or password.');

    await clickButton(client, 'Forgot password?');
    await waitForState(
      client,
      `(() => {
        const input = document.querySelector('#recovery-email');
        return {
          ready: window.location.pathname === '/forgot-password' &&
            window.location.search.includes('email=admin%40backy.io') &&
            document.body?.innerText?.includes('Forgot Password') &&
            document.body?.innerText?.includes('Request Recovery') &&
            input instanceof HTMLInputElement &&
            input.value === 'admin@backy.io',
          path: window.location.pathname,
          search: window.location.search,
          email: input instanceof HTMLInputElement ? input.value : '',
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Forgot password page',
    );
    await clickButton(client, 'Request Recovery');
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        const queued = body.includes('If recovery is available for this account') &&
          body.includes('reset email was queued') &&
          body.includes('Provider ') &&
          body.includes('status queued');
        const rateLimited = body.includes('Too many recovery requests. Please wait before trying again.');
        return {
          ready: window.location.pathname === '/forgot-password' &&
            (queued || rateLimited),
          path: window.location.pathname,
          queued,
          rateLimited,
          body: body.slice(0, 900),
        };
      })()`,
      'Forgot password request confirmation',
    );
    await clickButton(client, 'Back to login');
    await waitForState(
      client,
      `(() => {
        const input = document.querySelector('#email');
        return {
          ready: window.location.pathname === '/login' &&
            window.location.search.includes('email=admin%40backy.io') &&
            document.body?.innerText?.includes('Authenticated admin access') &&
            input instanceof HTMLInputElement &&
            input.value === 'admin@backy.io',
          path: window.location.pathname,
          search: window.location.search,
          email: input instanceof HTMLInputElement ? input.value : '',
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Login page after password recovery return',
    );
    await setInputValue(client, '#password', 'admin123');
    await clickButton(client, 'Sign in');
    const signInState = await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: (window.location.pathname === '/' && Boolean(document.querySelector('[data-testid="dashboard-command-center"]'))) ||
            Boolean(document.querySelector('#twoFactorCode')),
          needsMfa: Boolean(document.querySelector('#twoFactorCode')),
          path: window.location.pathname,
          body: body.slice(0, 900),
        };
      })()`,
      'Admin login or MFA challenge',
    );
    if (signInState.needsMfa) {
      assert(ADMIN_MFA_CODE, 'Admin login requires MFA. Set BACKY_ADMIN_MFA_CODE for the login smoke.');
      const mfaUx = await evaluate(client, `(() => {
        const input = document.querySelector('#twoFactorCode');
        const body = document.body?.innerText || '';
        return {
          inputMode: input instanceof HTMLInputElement ? input.inputMode : '',
          autocomplete: input instanceof HTMLInputElement ? input.autocomplete : '',
          autocapitalize: input instanceof HTMLInputElement ? input.autocapitalize : '',
          spellcheck: input instanceof HTMLInputElement ? input.spellcheck : null,
          placeholder: input instanceof HTMLInputElement ? input.placeholder : '',
          hasSeededHint: body.includes('Seeded demo MFA: backy-dev-mfa'),
        };
      })()`);
      assert(
        mfaUx.inputMode === 'text' &&
          mfaUx.autocomplete === 'one-time-code' &&
          mfaUx.autocapitalize === 'none' &&
          mfaUx.spellcheck === false &&
          mfaUx.placeholder.includes('MFA phrase') &&
          mfaUx.hasSeededHint,
        `MFA challenge should support string workspace codes and expose the local demo hint: ${JSON.stringify(mfaUx)}`,
      );
      await setInputValue(client, '#twoFactorCode', ADMIN_MFA_CODE);
      await clickButton(client, 'Sign in');
    }
    await waitForDashboard(client);
    if (SIDEBAR_CREATE_SMOKE) {
      const sidebarQuickCreate = await assertSidebarQuickCreateInteraction(client);
      console.log(JSON.stringify({
        ok: true,
        mode: 'sidebar-quick-create',
        route: '/login',
        sidebarQuickCreate,
      }, null, 2));
      return;
    }
    const sidebarViewport = await assertSidebarViewportScrollContract(client, 'Authenticated dashboard shell');
    const sidebarLegacySectionState = await assertSidebarLegacySectionStateMigration(client);
    const sidebarFilter = await assertSidebarFilterInteraction(client);
    const sidebarLayoutControls = await assertSidebarLayoutControlsInteraction(client);
    const searchHydration = await assertHeaderSearchHydration(client);
    const notificationCenter = await assertHeaderNotificationsInteraction(client);
    const accountMenu = await assertHeaderAccountMenuInteraction(client);
    const mobileNavigation = await assertMobileNavigationInteraction(client);
    const sessionStability = await assertSessionSurvivesIdleReloadAndNavigation(client);

    console.log(JSON.stringify({
      ok: true,
      route: '/login',
      auth: 'backend-backed',
      searchHydration,
      notificationCenter,
      accountMenu,
      mobileNavigation,
      sidebarViewport,
      sidebarLegacySectionState,
      sidebarFilter,
      sidebarLayoutControls,
      sessionStability,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
