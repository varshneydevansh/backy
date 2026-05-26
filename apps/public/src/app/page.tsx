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
        role: 'Next.js public renderer, read APIs, form/comment writes, media delivery, provider webhooks, and scheduled reconciliation.',
    },
    {
        name: 'backy-admin',
        root: 'apps/admin',
        role: 'Vite admin workspace for site, content, user, media, commerce, settings, and editor operations.',
    },
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
                    <h1 id="home-title">Visual website backend for teams shipping custom frontends.</h1>
                    <p className="hero-copy">
                        Build content in a Wix-like editor, keep WordPress-style operations simple, and publish through stable APIs that any Vercel frontend can consume.
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
