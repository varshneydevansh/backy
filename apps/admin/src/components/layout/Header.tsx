/**
 * ============================================================================
 * BACKY CMS - HEADER COMPONENT
 * ============================================================================
 *
 * The top header bar with search, notifications, and user menu.
 *
 * @module Header
 * @author Backy CMS Team
 * @license MIT
 */

import { useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Search,
  Bell,
  Menu,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

// ============================================
// TYPES
// ============================================

interface HeaderProps {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function Header({ sidebarCollapsed, onSidebarToggle }: HeaderProps) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { user, signOut } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Get page title from route
  const getPageTitle = () => {
    const path = routerState.location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/sites')) return 'Sites';
    if (path.startsWith('/pages')) return 'Pages';
    if (path.startsWith('/blog')) return 'Blog';
    if (path.startsWith('/media')) return 'Media';
    if (path.startsWith('/users')) return 'Users';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Dashboard';
  };

  const handleSignOut = () => {
    signOut();
    setUserMenuOpen(false);
    navigate({ to: '/login' });
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={onSidebarToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-accent"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-lg font-semibold hidden sm:block">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className={cn(
              'pl-9 pr-4 py-2 rounded-lg bg-muted text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'w-48 lg:w-64 transition-all'
            )}
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-accent">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="hidden sm:block text-sm font-medium">
              {user?.fullName || 'Guest'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent w-full text-left"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent w-full text-left"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-1 border-border" />
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
