/**
 * BACKY CMS - EDIT SITE PAGE
 * 
 * Uses PageShell and Global Store
 */

import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, Trash2, Globe, ExternalLink } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/sites/$siteId')({
    component: EditSitePage,
});

function EditSitePage() {
    const navigate = useNavigate();
    const { siteId } = Route.useParams();
    const { sites, updateSite, deleteSite } = useStore();

    const site = sites.find(s => s.id === siteId);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        customDomain: '',
        description: '',
        status: 'draft' as const,
    });

    // Load site data
    useEffect(() => {
        if (site) {
            setFormData({
                name: site.name,
                slug: site.slug,
                customDomain: site.customDomain || '',
                description: site.description,
                status: site.status as any,
            });
        }
    }, [site]);

    if (!site) {
        return (
            <PageShell title="Site Not Found" description="The site you requested does not exist.">
                <button onClick={() => navigate({ to: '/sites' })} className="text-primary hover:underline">
                    &larr; Back to Sites
                </button>
            </PageShell>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 800));

        updateSite(siteId, {
            name: formData.name,
            slug: formData.slug,
            customDomain: formData.customDomain || null,
            description: formData.description,
            status: formData.status,
        });

        navigate({ to: '/sites' });
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
            deleteSite(siteId);
            navigate({ to: '/sites' });
        }
    };

    return (
        <PageShell
            title={`Edit ${site.name}`}
            description="Manage site settings and configuration."
            action={
                <button
                    onClick={() => navigate({ to: '/sites' })}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
            }
        >
            <div className="max-w-2xl mx-auto space-y-8">
                {/* Status Card */}
                <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Globe className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">{site.name}</h3>
                                <StatusBadge status={site.status} />
                            </div>
                            <a
                                href={`https://${site.customDomain || `${site.slug}.backy.app`}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                            >
                                {site.customDomain || `${site.slug}.backy.app`}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                    <button className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 font-medium text-sm">
                        Visit Site
                    </button>
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Site Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                required
                            />
                        </div>

                        {/* Config Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium mb-2">URL Slug</label>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Custom Domain</label>
                                <input
                                    type="text"
                                    value={formData.customDomain}
                                    onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                                    placeholder="e.g. mysite.com"
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                        </div>

                        {/* Status */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Visibility</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="draft">Draft (Private)</option>
                                <option value="published">Published (Public)</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Site
                        </button>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => navigate({ to: '/sites' })}
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
                                    'hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md hover:shadow-lg'
                                )}
                            >
                                <Save className="w-4 h-4" />
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </PageShell>
    );
}
