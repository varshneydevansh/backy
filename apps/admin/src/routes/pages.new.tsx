/**
 * BACKY CMS - NEW PAGE
 */

import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, Layout, Globe } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/pages/new')({
    component: NewPageRoute,
});

function NewPageRoute() {
    const navigate = useNavigate();
    const { sites, addPage } = useStore();
    const [isLoading, setIsLoading] = useState(false);

    // Default to first site if available
    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        siteId: sites[0]?.id || '',
        template: 'blank',
        status: 'draft' as const,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 800));

        addPage({
            title: formData.title,
            slug: formData.slug,
            siteId: formData.siteId,
            status: formData.status,
        });

        navigate({ to: '/pages' });
    };

    return (
        <PageShell
            title="Create New Page"
            description="Add a new page to your site."
            action={
                <button onClick={() => navigate({ to: '/pages' })} className="p-2 rounded-lg hover:bg-accent">
                    <ArrowLeft className="w-5 h-5" />
                </button>
            }
        >
            <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">

                        {/* Site Selection */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Target Site</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <select
                                    value={formData.siteId}
                                    onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background"
                                    required
                                >
                                    <option value="" disabled>Select a site...</option>
                                    {sites.map(site => (
                                        <option key={site.id} value={site.id}>{site.name}</option>
                                    ))}
                                </select>
                            </div>
                            {sites.length === 0 && (
                                <p className="text-sm text-yellow-600 mt-1">
                                    You need to create a site first!
                                </p>
                            )}
                        </div>

                        {/* Title */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Page Title</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    title: e.target.value,
                                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                                })}
                                placeholder="About Us"
                                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                required
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label className="block text-sm font-medium mb-2">URL Slug</label>
                            <div className="flex items-center">
                                <span className="px-4 py-2.5 rounded-l-lg border border-r-0 bg-muted text-muted-foreground text-sm">
                                    /
                                </span>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                    placeholder="about"
                                    className="flex-1 px-4 py-2.5 rounded-r-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        </div>

                        {/* Template Selection */}
                        <div>
                            <label className="block text-sm font-medium mb-3">Choose Template</label>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: 'blank', name: 'Blank Page', desc: 'Start from scratch' },
                                    { id: 'landing', name: 'Landing Page', desc: 'Hero + Features + CTA' },
                                    { id: 'about', name: 'About Us', desc: 'Team + Story sections' },
                                    { id: 'contact', name: 'Contact', desc: 'Form + Map layout' },
                                ].map((tmpl) => (
                                    <label
                                        key={tmpl.id}
                                        className={cn(
                                            "flex flex-col p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md",
                                            formData.template === tmpl.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50"
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={tmpl.id}
                                            checked={formData.template === tmpl.id}
                                            onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                                            className="sr-only"
                                        />
                                        <div className="flex items-center gap-2 mb-1">
                                            <Layout className={cn(
                                                "w-4 h-4",
                                                formData.template === tmpl.id ? "text-primary" : "text-muted-foreground"
                                            )} />
                                            <span className="font-semibold">{tmpl.name}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{tmpl.desc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/pages' })}
                            className="px-6 py-2.5 rounded-lg border hover:bg-accent font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !formData.title || !formData.siteId}
                            className={cn(
                                'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                                'bg-primary text-primary-foreground font-medium',
                                'hover:bg-primary/90 disabled:opacity-50 shadow-md'
                            )}
                        >
                            <Save className="w-4 h-4" />
                            {isLoading ? 'Creating...' : 'Create Page'}
                        </button>
                    </div>
                </form>
            </div>
        </PageShell>
    );
}
