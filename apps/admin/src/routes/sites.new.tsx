/**
 * BACKY CMS - NEW SITE PAGE
 * 
 * Uses PageShell and Global Store
 */

import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Globe, Save, ArrowLeft } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/sites/new')({
    component: NewSitePage,
});

function NewSitePage() {
    const navigate = useNavigate();
    const { addSite } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        customDomain: '',
        description: '',
        status: 'draft' as const,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        addSite({
            name: formData.name,
            slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
            customDomain: formData.customDomain || null,
            description: formData.description,
            status: formData.status,
        });

        navigate({ to: '/sites' });
    };

    return (
        <PageShell
            title="Create New Site"
            description="Setup a new website for your project."
            action={
                <button
                    onClick={() => navigate({ to: '/sites' })}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
            }
        >
            <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Site Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    name: e.target.value,
                                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                                })}
                                placeholder="My Awesome Website"
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                required
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label className="block text-sm font-medium mb-2">URL Slug</label>
                            <div className="flex items-center">
                                <span className="px-4 py-2.5 rounded-l-lg border border-r-0 bg-muted text-muted-foreground text-sm">
                                    backy.app/
                                </span>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                    placeholder="my-site"
                                    className="flex-1 px-4 py-2.5 rounded-r-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        </div>

                        {/* Custom Domain */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Custom Domain (Optional)</label>
                            <div className="flex items-center gap-2">
                                <Globe className="w-5 h-5 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={formData.customDomain}
                                    onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                                    placeholder="example.com"
                                    className="flex-1 px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Brief description..."
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                        </div>

                        {/* Status */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Status</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="draft">Draft (Private)</option>
                                <option value="published">Published (Public)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/sites' })}
                            className="px-6 py-2.5 rounded-lg border hover:bg-accent font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !formData.name}
                            className={cn(
                                'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                                'bg-primary text-primary-foreground font-medium',
                                'hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md hover:shadow-lg'
                            )}
                        >
                            <Save className="w-4 h-4" />
                            {isLoading ? 'Creating...' : 'Create Site'}
                        </button>
                    </div>
                </form>
            </div>
        </PageShell>
    );
}
