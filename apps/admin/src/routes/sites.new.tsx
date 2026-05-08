/**
 * BACKY CMS - NEW SITE PAGE
 */

import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Globe, Layers3, Link2, Save } from 'lucide-react';
import { createSite } from '@/lib/adminContentApi';
import { useStore, type Site } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/sites/new')({
  component: NewSitePage,
});

const STATUS_OPTIONS: Array<{ value: Site['status']; label: string; detail: string }> = [
  { value: 'draft', label: 'Draft', detail: 'Private while you build pages, navigation, products, and forms.' },
  { value: 'published', label: 'Published', detail: 'Public immediately after creation.' },
  { value: 'archived', label: 'Archived', detail: 'Creates the workspace but keeps it out of active work.' },
];

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeDomain = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '');

const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isValidDomain = (value: string) => !value || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value);

function NewSitePage() {
  const navigate = useNavigate();
  const { sites, setSites } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    customDomain: '',
    description: '',
    status: 'draft' as Site['status'],
  });

  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[0],
    [formData.status],
  );
  const displaySlug = formData.slug || slugify(formData.name);
  const normalizedDomain = normalizeDomain(formData.customDomain);
  const publicAddress = normalizedDomain || `${displaySlug || 'new-site'}.backy.app`;
  const canSubmit = formData.name.trim().length > 1
    && isValidSlug(displaySlug)
    && isValidDomain(normalizedDomain);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      setError('Add a site name, use a valid URL slug, and check the custom domain format.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const created = await createSite({
        name: formData.name.trim(),
        slug: displaySlug,
        customDomain: normalizedDomain || null,
        description: formData.description.trim(),
        status: formData.status,
      });
      setSites([created, ...sites.filter((site) => site.id !== created.id)]);
      navigate({ to: '/sites' });
    } catch (createError) {
      setError(createError instanceof Error
        ? `${createError.message}. The site was not created because the backend did not persist it.`
        : 'Unable to create site. The site was not persisted.');
      setIsLoading(false);
    }
  };

  return (
    <PageShell
      title="Create site"
      description="Start a managed frontend workspace that Backy can drive through APIs and admin controls."
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/sites' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Sites
        </button>
      }
      className="mx-auto max-w-6xl"
    >
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Site identity</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This becomes the root record for pages, navigation, SEO, redirects, media, forms, and commerce.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Site name</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({
                  ...formData,
                  name: e.target.value,
                  slug: slugEdited ? formData.slug : slugify(e.target.value),
                })}
                placeholder="Northstar Studio"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Status</span>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Site['status'] })}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedStatus.detail}</span>
            </label>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">URL slug</span>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="border-r border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">backy.app/</span>
                <input
                  type="text"
                  value={displaySlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setFormData({ ...formData, slug: slugify(e.target.value) });
                  }}
                  placeholder="northstar-studio"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  required
                />
              </div>
              {!isValidSlug(displaySlug) && (
                <span className="mt-2 block text-xs text-red-600">Use lowercase letters, numbers, and hyphens.</span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium">Custom domain</span>
              <div className="relative mt-2">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.customDomain}
                  onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                  onBlur={(e) => setFormData({ ...formData, customDomain: normalizeDomain(e.target.value) })}
                  placeholder="example.com"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>
              {!isValidDomain(normalizedDomain) && (
                <span className="mt-2 block text-xs text-red-600">Use a domain like example.com.</span>
              )}
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Portfolio, product catalog, blog, booking site, or client workspace."
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Globe className="h-4 w-4 text-teal-700" />
              Public address
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-3">
              <p className="break-all text-sm font-semibold text-foreground">{publicAddress}</p>
              <p className="mt-1 text-xs text-muted-foreground">{normalizedDomain ? 'Custom domain' : 'Managed Backy subdomain'}</p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers3 className="h-4 w-4 text-teal-700" />
              Workspace includes
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {[
                'Pages and blog content',
                'Navigation, redirects, SEO, and readiness checks',
                'Media, forms, comments, contacts, products, and orders',
                'Headless API records for a custom frontend',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading || !canSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Creating...' : 'Create site'}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/sites' })}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </aside>
      </form>
    </PageShell>
  );
}
