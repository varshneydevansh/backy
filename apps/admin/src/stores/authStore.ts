/**
 * ============================================================================
 * BACKY CMS - AUTHENTICATION STORE
 * ============================================================================
 *
 * Zustand store for managing authentication state.
 * Works with localStorage for development, can be swapped for real auth later.
 *
 * @module AuthStore
 * @author Backy CMS Team
 * @license MIT
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'editor' | 'viewer';
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

// ============================================
// MOCK USERS (for development)
// ============================================

const MOCK_USERS: Record<string, { password: string; user: User }> = {
  'admin@backy.io': {
    password: 'admin123',
    user: {
      id: '1',
      email: 'admin@backy.io',
      fullName: 'Admin User',
      role: 'admin',
    },
  },
  'editor@backy.io': {
    password: 'editor123',
    user: {
      id: '2',
      email: 'editor@backy.io',
      fullName: 'Editor User',
      role: 'editor',
    },
  },
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
      isLoading: false,
      error: null,

      // ============================================
      // ACTIONS
      // ============================================

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        const mockUser = MOCK_USERS[email.toLowerCase()];

        if (!mockUser || mockUser.password !== password) {
          set({
            error: 'Invalid email or password',
            isLoading: false,
          });
          throw new Error('Invalid credentials');
        }

        set({
          user: mockUser.user,
          isLoading: false,
          error: null,
        });
      },

      signOut: () => {
        set({
          user: null,
          isLoading: false,
          error: null,
        });
        // Redirect handled by component
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'backy-auth-storage',
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const selectIsAuthenticated = (state: AuthStore): boolean =>
  !!state.user;

export const selectIsAdmin = (state: AuthStore): boolean =>
  state.user?.role === 'admin';

export const selectCanEdit = (state: AuthStore): boolean =>
  state.user?.role === 'admin' || state.user?.role === 'editor';
