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
import { acceptAdminInvite, fetchAdminSession, loginAdmin, logoutAdmin, resetAdminPassword, type AdminSession } from '@/lib/adminAuthApi';

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
  signIn: (email: string, password: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

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

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await loginAdmin(email, password);
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
          throw error;
        }
      },

      acceptInvite: async (token: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await acceptAdminInvite(token);
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
          throw error;
        }
      },

      resetPassword: async (token: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const data = await resetAdminPassword(token, password);
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
          throw error;
        }
      },

      signOut: () => {
        const token = useAuthStore.getState().session?.token;
        void logoutAdmin(token);
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
        if (!token) return;

        set({ isLoading: true, error: null });
        try {
          const data = await fetchAdminSession(token);
          set({
            user: data.user,
            session: data.session,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Admin session expired';
          set({
            user: null,
            session: null,
            isLoading: false,
            error: message,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'backy-auth-storage',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
      }),
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const selectIsAuthenticated = (state: AuthStore): boolean =>
  Boolean(state.user && state.session?.token);

export const selectIsAdmin = (state: AuthStore): boolean =>
  state.user?.role === 'owner' || state.user?.role === 'admin';

export const selectCanEdit = (state: AuthStore): boolean =>
  state.user?.role === 'owner' || state.user?.role === 'admin' || state.user?.role === 'editor';
