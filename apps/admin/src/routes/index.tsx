/**
 * BACKY CMS - DASHBOARD HOME
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Globe,
  Layout,
  FileText,
  Users,
  Plus,
  ArrowUpRight,
  HardDrive
} from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const { user } = useAuthStore();
  const { sites, pages, posts, users } = useStore();

  // Calculate recent activity
  const recentItems = [
    ...sites.map(s => ({ type: 'site', action: 'updated', name: s.name, date: s.lastUpdated })),
    ...pages.map(p => ({ type: 'page', action: 'updated', name: p.title, date: p.lastUpdated })),
    ...posts.map(p => ({ type: 'post', action: 'updated', name: p.title, date: p.publishedAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  const stats = [
    { label: 'Total Sites', value: sites.length, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { label: 'Total Pages', value: pages.length, icon: Layout, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { label: 'Blog Posts', value: posts.length, icon: FileText, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    { label: 'Team Members', value: users.length, icon: Users, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
  ];

  return (
    <PageShell
      title="Dashboard"
      description={`Welcome back, ${user?.fullName || 'Admin'}. Here's what's happening.`}
    >
      <div className="space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-6 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold">{stat.value}</h3>
              </div>
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quick Actions */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link to="/sites/new" className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">New Site</span>
                </Link>
                <Link to="/pages/new" className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20">
                    <Layout className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">New Page</span>
                </Link>
                <Link to="/blog/new" className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">New Post</span>
                </Link>
                <Link to="/media" className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20">
                    <HardDrive className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">Upload</span>
                </Link>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Recent Activity</h3>
                <Link to="/sites" className="text-sm text-primary hover:underline flex items-center gap-1">
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {recentItems.length > 0 ? (
                  recentItems.map((item, i) => (
                    <div key={i} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                        item.type === 'site' ? "bg-blue-100 text-blue-700" :
                          item.type === 'page' ? "bg-purple-100 text-purple-700" :
                            "bg-amber-100 text-amber-700"
                      )}>
                        {item.type === 'site' ? 'S' : item.type === 'page' ? 'P' : 'B'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          <span className="capitalize">{item.action}</span> {item.type} <span className="text-foreground">"{item.name}"</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-primary to-purple-600 rounded-xl p-6 text-white shadow-lg">
              <h3 className="font-bold text-lg mb-2">Pro Tips</h3>
              <p className="text-primary-foreground/90 text-sm mb-4">
                Did you know you can use the visual editor to build pages faster?
              </p>
              <button className="px-4 py-2 bg-white text-primary rounded-lg text-sm font-medium hover:bg-white/90">
                Try Editor
              </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold mb-4">System Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono">v1.2.0</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Database</span>
                  <span className="flex items-center gap-2 text-green-600">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Connected
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Storage</span>
                  <span>45% Used</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[45%]" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
