/**
 * ============================================================================
 * BACKY CMS - AUTHENTICATION STORE
 * ============================================================================
 *
 * Zustand store for managing authentication state.
 * Login/session validation is handled by the admin auth API.
 *
 * @module AuthStore
 * @author Backy CMS Team
 * @license MIT
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { acceptAdminInvite, AdminAuthNetworkError, fetchAdminSession, loginAdmin, logoutAdmin, resetAdminPassword, rotateAdminSession, type AdminSession } from '@/lib/adminAuthApi';
import { clearUserPermissionsCache } from '@/lib/adminContentApi';
import { clearActiveAdminSessionToken, setActiveAdminSessionToken } from '@/lib/adminSessionToken';

// ============================================
// TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  session: AdminSession | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  signIn: (email: string, password: string, twoFactorCode?: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshSession: () => Promise<void>;
  rotateSession: () => Promise<AdminSession>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

const isUnexpiredSession = (session: AdminSession | null): session is AdminSession => {
  if (!session?.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

// ============================================
// STORE
// ============================================

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // ============================================
      // STATE - isLoading starts FALSE so form works
      // ============================================
      user: null,
      session: null,
      isLoading: false,
      error: null,

      // ============================================
      // ACTIONS
      // ============================================

      signIn: async (email: string, password: string, twoFactorCode?: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await loginAdmin(email, password, twoFactorCode);
          clearUserPermissionsCache();
          setActiveAdminSessionToken(data.session.token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid email or password';
          set({
            error: message,
            isLoading: false,
            user: null,
            session: null,
          });
          clearActiveAdminSessionToken();
          clearUserPermissionsCache();
          throw error;
        }
      },

      acceptInvite: async (token: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await acceptAdminInvite(token);
          clearUserPermissionsCache();
          setActiveAdminSessionToken(data.session.token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to accept invite';
          set({
            error: message,
            isLoading: false,
            user: null,
            session: null,
          });
          clearActiveAdminSessionToken();
          clearUserPermissionsCache();
          throw error;
        }
      },

      resetPassword: async (token: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await resetAdminPassword(token, password);
          clearUserPermissionsCache();
          setActiveAdminSessionToken(data.session.token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to reset password';
          set({
            error: message,
            isLoading: false,
            user: null,
            session: null,
          });
          clearActiveAdminSessionToken();
          clearUserPermissionsCache();
          throw error;
        }
      },

      signOut: () => {
        const token = useAuthStore.getState().session?.token;
        void logoutAdmin(token);
        clearUserPermissionsCache();
        clearActiveAdminSessionToken();
        set({
          user: null,
          session: null,
          isLoading: false,
          error: null,
        });
        // Redirect handled by component
      },

      refreshSession: async () => {
        const token = useAuthStore.getState().session?.token;

        set({ isLoading: true, error: null });
        try {
          const data = await fetchAdminSession(token);
          setActiveAdminSessionToken(data.session.token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Admin session expired';
          const current = useAuthStore.getState();
          if (error instanceof AdminAuthNetworkError && current.user && isUnexpiredSession(current.session)) {
            setActiveAdminSessionToken(current.session.token);
            set({
              user: current.user,
              session: current.session,
              isLoading: false,
              error: message,
            });
            return;
          }

          set({
            user: null,
            session: null,
            isLoading: false,
            error: message,
          });
          clearActiveAdminSessionToken();
          clearUserPermissionsCache();
        }
      },

      rotateSession: async () => {
        const token = useAuthStore.getState().session?.token;

        set({ isLoading: true, error: null });
        try {
          const data = await rotateAdminSession(token);
          clearUserPermissionsCache();
          setActiveAdminSessionToken(data.session.token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
          return data.session;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to rotate admin session';
          set({
            isLoading: false,
            error: message,
          });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'backy-auth-storage',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AuthStore>;
        const persistedSession = persisted.session && persisted.session.issuedAt && persisted.session.expiresAt && persisted.session.authMode
          ? {
              token: persisted.session.authMode === 'local-demo' ? persisted.session.token : undefined,
              issuedAt: persisted.session.issuedAt,
              expiresAt: persisted.session.expiresAt,
              authMode: persisted.session.authMode,
            }
          : null;
        setActiveAdminSessionToken(persistedSession?.token);
        return {
          ...currentState,
          ...persisted,
          session: persistedSession,
        };
      },
      partialize: (state) => ({
        user: state.user,
        session: state.session
          ? {
              token: state.session.authMode === 'local-demo' ? state.session.token : undefined,
              issuedAt: state.session.issuedAt,
              expiresAt: state.session.expiresAt,
              authMode: state.session.authMode,
            }
          : null,
      }),
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const selectIsAuthenticated = (state: AuthStore): boolean =>
  Boolean(state.user && state.session);

export const selectIsAdmin = (state: AuthStore): boolean =>
  state.user?.role === 'owner' || state.user?.role === 'admin';

export const selectCanEdit = (state: AuthStore): boolean =>
  state.user?.role === 'owner' || state.user?.role === 'admin' || state.user?.role === 'editor';
