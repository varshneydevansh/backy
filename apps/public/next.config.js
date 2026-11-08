const runtimeFileTracingExcludes = ['./data/**/*', './.backy-private/**/*', './public/uploads/**/*'];

/** @type {import('next').NextConfig} */
const nextConfig = {
    ...(process.env.BACKY_NEXT_DIST_DIR ? { distDir: process.env.BACKY_NEXT_DIST_DIR } : {}),

    // Enable React strict mode for better development experience
    reactStrictMode: true,

    // Bundle Backy workspace packages into Vercel functions. Optional provider
    // clients stay lazy inside those packages so unused drivers are not required.
    transpilePackages: ['@backy-cms/core', '@backy-cms/editor', '@backy/db', '@backy/storage'],

    // Demo seeds are compiled constants. Mutable local stores/private journals
    // belong to the runtime filesystem and must never enter release payloads.
    outputFileTracingExcludes: {
        '/*': runtimeFileTracingExcludes,
        // Proxy/server entries are bare names, not slash-prefixed route paths.
        middleware: runtimeFileTracingExcludes,
        'next-server': runtimeFileTracingExcludes,
    },

    // Configure for subdomain routing
    async rewrites() {
        return {
            // Handle subdomain routing for sites
            beforeFiles: [
                {
                    source: '/:path((?!api(?:/|$)|_next(?:/|$)|sites(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)',
                    has: [
                        {
                            type: 'host',
                            value: '(?<subdomain>[^.]+)\\.(?<domain>(?!vercel\\.app$).*[A-Za-z].*)',
                        },
                    ],
                    destination: '/sites/:subdomain/:path',
                },
            ],
        };
    },

    // Image optimization domains
    images: {
        // Managed media must keep visibility/signature checks on every request.
        // The guarded transform route performs its own Sharp conversion.
        localPatterns: [],
        remotePatterns: [
            { protocol: 'https', hostname: '**.supabase.co' },
            { protocol: 'https', hostname: '**.amazonaws.com' },
        ],
    },

    // Experimental features
    experimental: {
        // Enable server actions for form handling
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
};

module.exports = nextConfig;
