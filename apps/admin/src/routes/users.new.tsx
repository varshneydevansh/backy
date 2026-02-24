/**
 * BACKY CMS - NEW USER PAGE
 */

import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, UserPlus, Mail, Lock } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/users/new')({
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const { addUser } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'editor' as const,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    addUser(formData);
    navigate({ to: '/users' });
  };

  return (
    <PageShell
      title="Invite Team Member"
      description="Send an invitation to join your team."
      action={
        <button onClick={() => navigate({ to: '/users' })} className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </button>
      }
    >
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium mb-2">Role</label>
              <div className="grid gap-3">
                {['admin', 'editor', 'viewer'].map((role) => (
                  <label
                    key={role}
                    className={cn(
                      "flex items-center p-3 border rounded-lg cursor-pointer transition-colors",
                      formData.role === role ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={formData.role === role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                    />
                    <div className="ml-3">
                      <span className="block text-sm font-medium capitalize">{role}</span>
                      <span className="block text-xs text-muted-foreground">
                        {role === 'admin' ? 'Full access to everything' :
                          role === 'editor' ? 'Can create and edit content' :
                            'Read-only access'}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/users' })}
              className="px-6 py-2.5 rounded-lg border hover:bg-accent font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.email}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                'bg-primary text-primary-foreground font-medium',
                'hover:bg-primary/90 disabled:opacity-50 shadow-md'
              )}
            >
              <UserPlus className="w-4 h-4" />
              {isLoading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
