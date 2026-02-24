/**
 * BACKY CMS - EDIT USER PAGE
 */

import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Save, Trash2, Mail, ShieldAlert } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/users/$userId')({
  component: EditUserPage,
});

function EditUserPage() {
  const navigate = useNavigate();
  const { userId } = Route.useParams();
  const { users, updateUser, deleteUser } = useStore();
  const user = users.find(u => u.id === userId);

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<{
    fullName: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
  }>({
    fullName: '',
    email: '',
    role: 'editor',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      });
    }
  }, [user]);

  if (!user) {
    return (
      <PageShell title="User Not Found" description="The user you requested doesn't exist.">
        <button onClick={() => navigate({ to: '/users' })} className="text-primary hover:underline">
          &larr; Back to Users
        </button>
      </PageShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    updateUser(userId, formData);
    navigate({ to: '/users' });
  };

  return (
    <PageShell
      title="Edit User"
      description={`Manage settings for ${user.fullName}`}
      action={
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm('Remove user?')) {
                deleteUser(userId);
                navigate({ to: '/users' });
              }
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="space-y-8">

          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-xl p-6">
            <h3 className="text-red-800 dark:text-red-400 font-semibold flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4" />
              Reset Password
            </h3>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
              Send a password reset email to the user.
            </p>
            <button type="button" className="px-4 py-2 bg-white dark:bg-transparent border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">
              Send Reset Link
            </button>
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
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                'bg-primary text-primary-foreground font-medium',
                'hover:bg-primary/90 disabled:opacity-50 shadow-md'
              )}
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
