const adminHref = process.env.NEXT_PUBLIC_BACKY_ADMIN_APP_URL || process.env.BACKY_ADMIN_APP_URL || 'http://localhost:5173';

const platformStats = [
    { label: 'Admin surfaces audited', value: '41' },
    { label: 'External certification gates', value: '4' },
    { label: 'Public contract version', value: 'v1' },
];

const releaseTracks = [
    {
        title: 'Author visually',
        detail: 'Pages, blog posts, reusable sections, forms, media, products, and site settings stay editable in one CMS.',
    },
    {
        title: 'Persist the full design',
        detail: 'Fonts, theme tokens, responsive overrides, animations, bindings, editable maps, and custom frontend provenance are stored with content.',
    },
    {
        title: 'Ship any frontend',
        detail: 'Manifest, OpenAPI, SDK, render payloads, media, forms, comments, and commerce endpoints expose the same source of truth.',
    },
];

const deploymentCards = [
    {
        name: 'backy-public',
        root: 'apps/public',
        role: 'Public Next.js runtime for page rendering, read APIs, form/comment writes, media delivery, provider webhooks, and scheduled reconciliation.',
    },
    {
        name: 'backy-admin',
        root: 'apps/admin',
        role: 'Protected Vite editor shell for site, content, user, media, commerce, settings, and editor operations.',
    },
];

const adminSecurityChecklist = [
    'Keep backy-admin behind Vercel Deployment Protection, team SSO, or an equivalent private access layer.',
    'Store database, admin, cron, provider, and storage secrets only on backy-public server-side environment variables.',
    'Use Supabase Auth or another provider-backed login for production admin users, with Backy user roles matched by email.',
    'Keep MFA enabled and never ship BACKY_ADMIN_API_KEY, BACKY_ADMIN_SECRET_KEY, CRON_SECRET, database URLs, or provider keys to Vite or any NEXT_PUBLIC/VITE variable.',
];

const apiLinks = [
    { label: 'Site manifest', href: '/api/sites/site-demo/manifest' },
    { label: 'OpenAPI', href: '/api/sites/site-demo/openapi' },
    { label: 'Public pages', href: '/api/sites/site-demo/pages' },
    { label: 'Demo site', href: '/sites/demo' },
];

export default function Home() {
    return (
        <main className="site-shell">
            <section className="launch-hero" aria-labelledby="home-title">
                <div className="workspace-scene" aria-hidden="true">
                    <div className="scene-topbar">
                        <span />
                        <span />
                        <span />
                    </div>
                    <div className="scene-sidebar">
                        {['Sites', 'Pages', 'Editor', 'Media', 'Commerce', 'Settings'].map((item, index) => (
                            <span key={item} className={index === 2 ? 'active' : undefined}>{item}</span>
                        ))}
                    </div>
                    <div className="scene-canvas">
                        <div className="canvas-toolbar">
                            <span>Desktop</span>
                            <span>Tablet</span>
                            <span>Mobile</span>
                        </div>
                        <div className="canvas-frame">
                            <div className="canvas-nav" />
                            <div className="canvas-hero" />
                            <div className="canvas-grid">
                                <span />
                                <span />
                                <span />
                            </div>
                        </div>
                    </div>
                    <div className="scene-inspector">
                        <strong>Design contract</strong>
                        <span>tokens.colors.primary</span>
                        <span>fonts.heading.family</span>
                        <span>responsive.mobile.width</span>
                        <span>bindings.collection.slug</span>
                    </div>
                </div>

                <div className="hero-content">
                    <p className="eyebrow">Backy CMS</p>
                    <p className="runtime-pill">You are viewing backy-public: the public API and render runtime.</p>
                    <h1 id="home-title">Visual website backend for teams shipping custom frontends.</h1>
                    <p className="hero-copy">
                        Build content in the separate protected admin editor, keep WordPress-style operations simple, and publish through stable APIs that any Vercel frontend can consume.
                    </p>
                    <div className="hero-actions" aria-label="Primary links">
                        <a className="primary-link" href={adminHref}>Open admin</a>
                        <a className="secondary-link" href="/api/sites/site-demo/manifest">Inspect manifest</a>
                    </div>
                </div>

                <dl className="hero-stats" aria-label="Backy release status">
                    {platformStats.map((stat) => (
                        <div key={stat.label}>
                            <dt>{stat.label}</dt>
                            <dd>{stat.value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section className="runtime-section" aria-labelledby="runtime-title">
                <div>
                    <p className="section-kicker">Runtime boundary</p>
                    <h2 id="runtime-title">This page is not the private editor.</h2>
                    <p>
                        Localhost 3001 is the public Backy service: it renders hosted sites and exposes safe discovery, manifest, OpenAPI, media, form, blog, and commerce endpoints. The real admin workspace runs separately at the configured admin URL.
                    </p>
                </div>
                <div className="runtime-cards" aria-label="Backy app boundary">
                    <article>
                        <span>Public</span>
                        <h3>backy-public</h3>
                        <p>Public routes, website render payloads, custom frontend APIs, and server-only admin API handlers.</p>
                    </article>
                    <article>
                        <span>Protected</span>
                        <h3>backy-admin</h3>
                        <p>Private visual editor and dashboard shell. It should never receive database, provider, cron, or admin secret values.</p>
                    </article>
                </div>
            </section>

            <section className="section-grid" aria-labelledby="tracks-title">
                <div>
                    <p className="section-kicker">Release path</p>
                    <h2 id="tracks-title">One backend, precise design handoff, deployable frontend.</h2>
                </div>
                <div className="track-list">
                    {releaseTracks.map((track) => (
                        <article key={track.title} className="track-item">
                            <h3>{track.title}</h3>
                            <p>{track.detail}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="deploy-section" aria-labelledby="deploy-title">
                <div className="section-heading">
                    <p className="section-kicker">Vercel topology</p>
                    <h2 id="deploy-title">Two project roots for the launch environment.</h2>
                </div>
                <div className="deploy-grid">
                    {deploymentCards.map((card) => (
                        <article key={card.name} className="deploy-card">
                            <div>
                                <p>{card.root}</p>
                                <h3>{card.name}</h3>
                            </div>
                            <span>{card.role}</span>
                        </article>
                    ))}
                </div>
            </section>

            <section className="security-section" aria-labelledby="security-title">
                <div className="section-heading">
                    <p className="section-kicker">Admin security</p>
                    <h2 id="security-title">Production admin setup stays private by construction.</h2>
                    <p>
                        Demo accounts are only for local development. Production login should be backed by persistent auth, role-scoped Backy users, server-side sessions, and environment variables that never enter the browser bundle.
                    </p>
                </div>
                <ol className="security-list">
                    {adminSecurityChecklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </section>

            <section className="api-band" aria-labelledby="api-title">
                <div>
                    <p className="section-kicker">Custom frontend contract</p>
                    <h2 id="api-title">Start from the same payloads the editor saves.</h2>
                    <p>
                        These public demo endpoints expose content, theme tokens, media references, route metadata, and schema discovery for generated or hand-built frontends.
                    </p>
                </div>
                <nav className="api-links" aria-label="Public API examples">
                    {apiLinks.map((link) => (
                        <a key={link.href} href={link.href}>{link.label}</a>
                    ))}
                </nav>
            </section>
        </main>
    );
}
