/**
 * ============================================================================
 * BACKY - LOGIN PAGE
 * ============================================================================
 *
 * The login page for the admin dashboard. Users can sign in with
 * email and password.
 *
 * @module LoginPage
 * @author Backy Team
 * @license MIT
 */

import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

// ============================================
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

// ============================================
// COMPONENT
// ============================================

/**
 * Login Page Component
 *
 * Provides email/password login form with validation.
 */
function LoginPage() {
  const navigate = useNavigate();
  const { signIn, isLoading, error, clearError } = useAuthStore();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  /**
   * Validate form inputs
   */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) return;

    try {
      await signIn(email, password);
      // Redirect to dashboard on success
      navigate({ to: '/' });
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/backy-logo.svg"
            alt="Backy logo"
            className="w-16 h-16 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold">Backy</h1>
          <p className="text-muted-foreground mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-card border border-border rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={cn(
                    'w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                    formErrors.email && 'border-red-500 focus:ring-red-500'
                  )}
                  disabled={isLoading}
                />
              </div>
              {formErrors.email && (
                <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn(
                    'w-full pl-10 pr-12 py-2.5 rounded-lg border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                    formErrors.password && 'border-red-500 focus:ring-red-500'
                  )}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p className="text-red-500 text-sm mt-1">
                  {formErrors.password}
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full py-2.5 px-4 rounded-lg font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center text-sm">
            <a
              href="#"
              className="text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                alert('Password reset coming soon!');
              }}
            >
              Forgot password?
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          Don't have an account?{' '}
          <a
            href="#"
            className="text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              alert('Contact your admin to create an account');
            }}
          >
            Contact admin
          </a>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
